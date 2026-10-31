#!/usr/bin/env python3
"""
지면 포트폴리오 PDF 안의 이미지를 발표 장표 소스로 쓰도록 프로젝트별 폴더로 뽑는다.

    python3 scripts/extract-portfolio-images.py --pdf <포트폴리오.pdf> [--out <폴더>] [--work <작업폴더>]

흐름
1) pdfimages -all -p 로 PDF 내장 이미지를 --work/raw 에 원본 그대로 꺼낸다 (이미 있으면 재사용).
   JPEG 는 스트림 그대로(.jpg), 나머지는 poppler 가 디코드한 PNG. 알파 마스크(SMask)는 별도 파일로 나온다.
2) pypdf 로 이미지마다 (a) 색 공간의 ICC 프로파일, (b) 쪽 위에 놓인 회전·뒤집힘(CTM), (c) 소프트마스크용 보조 이미지 여부를 읽는다.
3) app/chronology.ts 의 projects 표(0-based 쪽 번호)로 쪽 → 프로젝트를 정하고, 프로젝트 밖 쪽(표지·목차·마지막)은 _etc.
4) 건너뛸 것을 거른다: SMask 자체 / 긴 변 400px 미만 / 소프트마스크 보조 이미지 / SHA-256 중복.
5) 변환: ICC 가 붙은 JPEG 는 sRGB 로 변환(poppler PNG 는 이미 sRGB 로 변환돼 나오므로 다시 하지 않음),
   SMask 가 있으면 합쳐 RGBA, 쪽에서 90°·180° 회전돼 놓인 이미지는 보이는 방향으로 세운다,
   긴 변 2560px 상한(확대 안 함), WebP q82.
6) <출력>/<시작연월>-<슬러그>/p<쪽0-based 두 자리>-<순번 두 자리>.webp 와 <출력>/index.json 을 쓴다.

원본 PDF·InDesign 패키지에는 아무것도 쓰지 않는다. 의존: python3 + Pillow(webp·lcms) + pypdf, poppler(pdfimages).
CMYK 이미지는 이 PDF 에 없어서(실측 0장) 기본 변환만 넣어 두었다 — 생기면 색을 눈으로 확인할 것.
"""
import argparse, concurrent.futures as cf, datetime, glob, hashlib, io, json, math, os, re, shutil, subprocess, sys, tempfile, unicodedata

from PIL import Image, ImageCms
from pypdf import PdfReader
from pypdf.generic import ContentStream

Image.MAX_IMAGE_PIXELS = None

# 경로 기본값은 이 저장소 기준: web/app/chronology.ts, 발표 폴더의 261103-yun/portfolio-images.
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CHRONOLOGY = os.path.join(REPO, "app", "chronology.ts")
DEFAULT_OUT = os.path.join(os.path.dirname(REPO), "261103-yun", "portfolio-images")
DEFAULT_WORK = os.path.join(tempfile.gettempdir(), "portfolio-extract")

LONG_MAX = 2560      # 출력 긴 변 상한 (작으면 확대하지 않음)
MIN_LONG = 400       # 원본 긴 변이 이만큼 미만이면 아이콘·조각으로 보고 건너뜀
QUALITY = 82

# build-works.py(jaeyeonkim.kr) 와 같은 슬러그. 키는 chronology.ts 의 title.
SLUGS = {
    "흐름지각": "flow-perception",
    "My Computer Has a Virus": "my-computer-has-a-virus",
    "홍익시디 소식지": "sidi-newsletter",
    "R777 웹사이트": "r777",
    "Pigment": "pigment",
    "대체 텍스트–이미지 기반 재귀적 학습 모델": "alt-text-research",
    "디자인 도구 기술과 한국 그래픽 디자인 포스터": "poster-research",
    "NCPT 99.8 Feat.TAEYONG": "998-percent",
    "ONKNOWN": "onknown",
    "카더가든 From Apartment": "from-apartment",
    "PWD.SIDI Constant of Intergration": "constant-of-integration",
    "낯선 접점 Strange Interface": "strange-interface",
    "Vibrant Images": "vibrant-images",
    "장기하 하기장기하": "hagi-jang-ki-ha",
    "음향형태론 Audio Morphology": "audio-morphology",
    "제16회 광주비엔날레": "gwangju-biennale-16",
    "신영준 Tourist": "tourist",
    "Visual Engineering Design": "ved",
}

ETC = "_etc"
OUT_DIR_RE = re.compile(r"^(\d{4}\.\d{2}-.+|_etc)$")


# ───────────────────────── 경로 · 입력 ─────────────────────────

def resolve_path(path):
    """macOS 한글 분해형(NFD)·조합형(NFC) 어느 쪽으로 적혀 있어도 실제 경로를 찾는다."""
    if os.path.exists(path):
        return path
    parts = path.split(os.sep)
    cur = os.sep
    for part in parts:
        if not part:
            continue
        nxt = os.path.join(cur, part)
        if not os.path.exists(nxt):
            want = unicodedata.normalize("NFC", part)
            hit = [n for n in os.listdir(cur) if unicodedata.normalize("NFC", n) == want]
            if not hit:
                sys.exit(f"경로를 찾을 수 없음: {path}  ({cur} 아래 '{part}')")
            nxt = os.path.join(cur, hit[0])
        cur = nxt
    return cur


def parse_chronology(ts_path):
    src = open(ts_path, encoding="utf-8").read()
    block = re.search(r"export const projects\s*=\s*\[(.*?)\n\];", src, re.S)
    if not block:
        sys.exit("chronology.ts 에서 projects 배열을 못 찾음")
    projects = []
    for m in re.finditer(r"\{\s*title:\s*'((?:[^'\\]|\\.)*)'\s*,\s*start:\s*'([^']*)'\s*,\s*period:\s*'([^']*)'\s*,\s*first:\s*(\d+)\s*,\s*last:\s*(\d+)\s*\}", block.group(1)):
        title, start, period, first, last = m.groups()
        title = title.replace("\\'", "'")
        slug = SLUGS.get(title)
        if not slug:
            slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or f"p{int(first):02d}"
            print(f"경고: SLUGS 에 없는 프로젝트 '{title}' → 임시 슬러그 {slug}", file=sys.stderr)
        projects.append(dict(title=title, start=start, period=period, first=int(first), last=int(last),
                             slug=slug, folder=f"{start}-{slug}"))
    if not projects:
        sys.exit("projects 항목을 하나도 못 읽음")
    return projects


def folder_for_page(projects, page0):
    for p in projects:
        if p["first"] <= page0 <= p["last"]:
            return p
    return None


# ───────────────────────── pdfimages ─────────────────────────

def list_images(pdf):
    out = subprocess.run(["pdfimages", "-list", pdf], check=True, capture_output=True, text=True).stdout
    rows = []
    for line in out.splitlines()[2:]:
        t = line.split()
        if len(t) < 16:
            continue
        rows.append(dict(page=int(t[0]), num=int(t[1]), type=t[2], w=int(t[3]), h=int(t[4]),
                         color=t[5], enc=t[8], obj=int(t[10])))
    return rows


def extract_raw(pdf, raw_dir, n_expected):
    os.makedirs(raw_dir, exist_ok=True)
    if len(glob.glob(os.path.join(raw_dir, "img-*"))) != n_expected:
        for f in glob.glob(os.path.join(raw_dir, "img-*")):
            os.remove(f)
        subprocess.run(["pdfimages", "-all", "-p", pdf, os.path.join(raw_dir, "img")], check=True)
    n = len(glob.glob(os.path.join(raw_dir, "img-*")))
    if n != n_expected:
        sys.exit(f"pdfimages 결과 {n}개 ≠ 목록 {n_expected}개")


def raw_file(raw_dir, row):
    hit = glob.glob(os.path.join(raw_dir, f"img-{row['page']:03d}-{row['num']:03d}.*"))
    if len(hit) != 1:
        sys.exit(f"원본 파일을 못 찾음: page {row['page']} num {row['num']}")
    return hit[0]


# ───────────────────────── pypdf: ICC · 배치 · 소프트마스크 ─────────────────────────

def icc_of(obj):
    """이미지의 ICCBased(또는 Indexed 의 base) 프로파일 바이트와 이름. 없으면 (None, 색공간 문자열)."""
    cs = obj.get("/ColorSpace")
    cs = cs.get_object() if cs is not None else None
    if isinstance(cs, list) and cs and cs[0] == "/Indexed":
        base = cs[1].get_object()
        label = "Indexed/" + (str(base[0]) if isinstance(base, list) else str(base))
        cs = base if isinstance(base, list) else None
    else:
        label = None
    if isinstance(cs, list) and cs and cs[0] == "/ICCBased":
        st = cs[1].get_object()
        data = st.get_data()
        try:
            name = ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(io.BytesIO(data))).strip()
        except Exception:
            name = "ICC"
        return data, f"ICC:{name}" if label is None else f"{label}:{name}"
    if label:
        return None, label
    return None, str(cs).lstrip("/") if cs is not None else "?"


def mat_mul(m, n):
    a, b, c, d, e, f = m
    A, B, C, D, E, F = n
    return (a * A + b * C, a * B + b * D, c * A + d * C, c * B + d * D, e * A + f * C + E, e * B + f * D + F)


def walk_images(reader, res, content, ctm, found, depth=0):
    """콘텐츠 스트림을 따라가며 이미지 XObject 의 (객체번호 → 그때의 CTM) 을 모은다. 폼은 재귀."""
    xo = res.get("/XObject") if res else None
    xo = xo.get_object() if xo else {}
    stack = []
    for operands, op in content.operations:
        if op == b"q":
            stack.append(ctm)
        elif op == b"Q":
            if stack:
                ctm = stack.pop()
        elif op == b"cm":
            ctm = mat_mul(tuple(float(x) for x in operands), ctm)
        elif op == b"Do":
            ref = xo.get(operands[0])
            if ref is None:
                continue
            obj = ref.get_object()
            sub = obj.get("/Subtype")
            if sub == "/Image":
                found.setdefault(ref.idnum, ctm)
            elif sub == "/Form" and depth < 8:
                fm = tuple(float(x) for x in obj["/Matrix"]) if "/Matrix" in obj else (1, 0, 0, 1, 0, 0)
                fres = obj.get("/Resources") or res
                walk_images(reader, fres.get_object() if fres else None, ContentStream(obj, reader),
                            mat_mul(fm, ctm), found, depth + 1)


def softmask_images(res, found, depth=0):
    """ExtGState /SMask 의 /G 그룹 안에 든 이미지 객체번호들 (알파 보조용, 보이는 내용이 아님)."""
    gss = res.get("/ExtGState") if res else None
    for gs in (gss.get_object().values() if gss else []):
        sm = gs.get_object().get("/SMask")
        if sm is None or sm == "/None":
            continue
        grp = sm.get_object()["/G"].get_object()
        gres = grp.get("/Resources")
        gres = gres.get_object() if gres else None
        xo = gres.get("/XObject") if gres else None
        for ref in (xo.get_object().values() if xo else []):
            o = ref.get_object()
            if o.get("/Subtype") == "/Image":
                found.add(ref.idnum)
            elif o.get("/Subtype") == "/Form" and depth < 4:
                softmask_images(o.get("/Resources").get_object() if o.get("/Resources") else None, found, depth + 1)


def orientation_from_ctm(ctm, tol=1.0):
    """CTM 으로 이미지가 쪽 위에서 어떻게 놓였는지. 90° 단위 회전·뒤집힘이면 (Pillow transpose 이름, 설명), 아니면 (None, 기울기°)."""
    a, b, c, d, _, _ = ctm
    ang = math.degrees(math.atan2(b, a))
    # u=(a,b): 이미지 오른쪽이 쪽에서 향하는 방향, v=(c,d): 이미지 위쪽이 향하는 방향. 4방향으로 양자화.
    def axis(x, y):
        n = math.hypot(x, y)
        if n == 0:
            return None
        x, y = x / n, y / n
        for name, (ax, ay) in {"+x": (1, 0), "-x": (-1, 0), "+y": (0, 1), "-y": (0, -1)}.items():
            if abs(x - ax) < math.sin(math.radians(tol)) + 1e-9 and abs(y - ay) < math.sin(math.radians(tol)) + 1e-9:
                return name
        return None
    u, v = axis(a, b), axis(c, d)
    table = {
        ("+x", "+y"): (None, "0"),
        ("+x", "-y"): ("FLIP_TOP_BOTTOM", "flip-v"),
        ("-x", "+y"): ("FLIP_LEFT_RIGHT", "flip-h"),
        ("-x", "-y"): ("ROTATE_180", "180"),
        ("+y", "-x"): ("ROTATE_90", "90ccw"),
        ("-y", "+x"): ("ROTATE_270", "90cw"),
        ("+y", "+x"): ("TRANSVERSE", "transverse"),
        ("-y", "-x"): ("TRANSPOSE", "transpose"),
    }
    if (u, v) in table:
        return table[(u, v)]
    return None, f"tilt{ang:.1f}"


def scan_pdf(pdf, rows):
    reader = PdfReader(pdf)
    meta = {}
    for r in rows:
        if r["type"] == "image" and r["obj"] not in meta:
            meta[r["obj"]] = icc_of(reader.get_object(r["obj"]))
    placed, soft = {}, set()
    for i, page in enumerate(reader.pages):
        res = page.get("/Resources")
        res = res.get_object() if res else None
        try:
            contents = page.get_contents()
            if contents is not None:
                walk_images(reader, res, ContentStream(contents, reader), (1, 0, 0, 1, 0, 0), placed)
            softmask_images(res, soft)
        except Exception as e:  # 한 쪽이 깨져도 나머지는 계속
            print(f"경고: {i}쪽 배치 분석 실패 ({e}) — 회전 없음으로 처리", file=sys.stderr)
    return meta, placed, soft


# ───────────────────────── 변환 (워커 프로세스) ─────────────────────────

_TRANSFORMS = {}


def srgb_transform(icc_bytes, mode):
    key = (hashlib.md5(icc_bytes).hexdigest(), mode)
    if key not in _TRANSFORMS:
        src = ImageCms.ImageCmsProfile(io.BytesIO(icc_bytes))
        dst = ImageCms.createProfile("sRGB")
        _TRANSFORMS[key] = ImageCms.buildTransform(src, dst, mode, "RGB", renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC)
    return _TRANSFORMS[key]


def to_rgb(path, icc):
    im = Image.open(path)
    im.load()
    is_jpeg = im.format == "JPEG"
    if im.mode == "CMYK":
        # Pillow 가 JPEG CMYK 의 Adobe 반전을 이미 풀어 준다. 프로파일이 있으면 그걸로, 없으면 기본 변환.
        return ImageCms.applyTransform(im, srgb_transform(icc, "CMYK")) if icc else im.convert("RGB")
    if im.mode in ("RGBA", "LA", "PA"):
        raise ValueError(f"예상 밖 알파 모드 {im.mode}: {path}")
    if im.mode in ("1", "P", "L", "I;16", "I"):
        im = im.convert("RGB")
    elif im.mode != "RGB":
        raise ValueError(f"예상 밖 모드 {im.mode}: {path}")
    # poppler 가 만든 PNG 는 ICC 가 이미 sRGB 로 변환돼 있음(실측 평균차 0.004). 스트림 그대로인 JPEG 만 변환한다.
    if icc and is_jpeg:
        im = ImageCms.applyTransform(im, srgb_transform(icc, "RGB"))
    return im


def convert(task):
    try:
        im = to_rgb(task["raw"], task["icc"])
        has_alpha = False
        if task["smask"]:
            mask = Image.open(task["smask"])
            mask.load()
            mask = mask.convert("L")
            if mask.size != im.size:
                mask = mask.resize(im.size, Image.Resampling.LANCZOS)
            if mask.getextrema() != (255, 255):
                im.putalpha(mask)
                has_alpha = True
        if task["transpose"]:
            im = im.transpose(getattr(Image.Transpose, task["transpose"]))
        w, h = im.size
        m = max(w, h)
        if m > LONG_MAX:
            s = LONG_MAX / m
            im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.Resampling.LANCZOS)
        os.makedirs(os.path.dirname(task["dst"]), exist_ok=True)
        im.save(task["dst"], "WEBP", quality=QUALITY, method=6)
        return dict(ok=True, out_size=list(im.size), alpha=has_alpha, bytes=os.path.getsize(task["dst"]))
    except Exception as e:
        return dict(ok=False, error=f"{type(e).__name__}: {e}")


# ───────────────────────── 메인 ─────────────────────────

def sha256_of(*paths):
    h = hashlib.sha256()
    for p in paths:
        with open(p, "rb") as f:
            h.update(f.read())
        h.update(b"|")
    return h.hexdigest()


def clean_output(out):
    if not os.path.isdir(out):
        return
    for n in os.listdir(out):
        p = os.path.join(out, n)
        if n == "index.json" and os.path.isfile(p):
            os.remove(p)
        elif os.path.isdir(p) and OUT_DIR_RE.match(n):
            shutil.rmtree(p)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1].strip())
    ap.add_argument("--pdf", required=True, help="2608_김재연_포트폴리오.pdf (InDesign 패키지 안의 원본, downsize 아님)")
    ap.add_argument("--chronology", default=DEFAULT_CHRONOLOGY)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--work", default=DEFAULT_WORK)
    ap.add_argument("--jobs", type=int, default=min(8, os.cpu_count() or 4))
    a = ap.parse_args()

    pdf = resolve_path(a.pdf)
    projects = parse_chronology(resolve_path(a.chronology))
    rows = list_images(pdf)
    raw_dir = os.path.join(a.work, "raw")
    extract_raw(pdf, raw_dir, len(rows))
    meta, placed, soft = scan_pdf(pdf, rows)

    skipped = []   # dict(page, num, reason, detail)
    tasks = []     # 변환할 것
    seen = {}      # sha256 -> 먼저 남긴 (page, num)

    def skip(row, reason, detail=""):
        skipped.append(dict(page=row["page"] - 1, pdf_page=row["page"], num=row["num"], reason=reason, detail=detail,
                            orig_size=[row["w"], row["h"]]))

    # 이미지 행 뒤에 같은 객체번호의 smask 행이 붙는다.
    pending_mask = {}
    for i, row in enumerate(rows):
        if row["type"] == "smask":
            pending_mask[row["obj"]] = row
    for row in sorted(rows, key=lambda r: (r["page"], r["num"])):
        page0 = row["page"] - 1
        if row["type"] == "smask":
            skip(row, "smask", "알파로 합성하는 데 쓰고 개별 파일은 만들지 않음")
            continue
        if max(row["w"], row["h"]) < MIN_LONG:
            skip(row, "small", f"긴 변 {max(row['w'], row['h'])}px < {MIN_LONG}")
            continue
        if row["obj"] in soft and row["obj"] not in placed:
            skip(row, "softmask_group", "ExtGState 소프트마스크 그룹 안의 보조 그레이 이미지(보이는 내용 아님)")
            continue
        path = raw_file(raw_dir, row)
        mrow = pending_mask.get(row["obj"])
        mpath = raw_file(raw_dir, mrow) if mrow else None
        digest = sha256_of(path, *( [mpath] if mpath else [] ))
        if digest in seen:
            skip(row, "duplicate", f"SHA-256 동일: p{seen[digest][0]:02d} num {seen[digest][1]}")
            continue
        seen[digest] = (page0, row["num"])
        icc, cs_label = meta[row["obj"]]
        transpose, orient = orientation_from_ctm(placed[row["obj"]]) if row["obj"] in placed else (None, "unplaced")
        proj = folder_for_page(projects, page0)
        tasks.append(dict(row=row, page0=page0, folder=proj["folder"] if proj else ETC, raw=path, smask=mpath,
                          icc=icc, colorspace=cs_label, transpose=transpose, orient=orient, sha256=digest))

    # 쪽별 순번 → 파일명
    per_page = {}
    out = a.out
    clean_output(out)
    os.makedirs(out, exist_ok=True)
    for t in tasks:
        per_page[t["page0"]] = per_page.get(t["page0"], 0) + 1
        t["seq"] = per_page[t["page0"]]
        t["name"] = f"p{t['page0']:02d}-{t['seq']:02d}.webp"
        t["dst"] = os.path.join(out, t["folder"], t["name"])

    with cf.ProcessPoolExecutor(max_workers=a.jobs) as ex:
        results = list(ex.map(convert, [{k: t[k] for k in ("raw", "smask", "icc", "transpose", "dst")} for t in tasks], chunksize=1))

    failed = [(t, r) for t, r in zip(tasks, results) if not r["ok"]]
    for t, r in failed:
        print(f"실패: p{t['page0']:02d} num {t['row']['num']}: {r['error']}", file=sys.stderr)

    order = [p["folder"] for p in sorted(projects, key=lambda p: p["folder"])] + [ETC]
    info = {p["folder"]: p for p in projects}
    folders = []
    for fname in order:
        files = []
        for t, r in zip(tasks, results):
            if t["folder"] != fname or not r["ok"]:
                continue
            files.append(dict(file=t["name"], page=t["page0"], pdf_page=t["page0"] + 1, pdfimages_num=t["row"]["num"],
                              orig_size=[t["row"]["w"], t["row"]["h"]], out_size=r["out_size"], alpha=r["alpha"],
                              colorspace=t["colorspace"], placed=t["orient"], bytes=r["bytes"], sha256=t["sha256"]))
        p = info.get(fname)
        folders.append(dict(folder=fname, title=p["title"] if p else "(프로젝트 밖: 표지·목차·마지막 장)",
                            period=p["period"] if p else "", pages=[p["first"], p["last"]] if p else [0, 1, 78],
                            count=len(files), bytes=sum(f["bytes"] for f in files), files=files))
    reasons = {}
    for s in skipped:
        reasons[s["reason"]] = reasons.get(s["reason"], 0) + 1
    index = dict(
        source=os.path.basename(pdf),
        generated=datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        note="page 는 0-based(chronology.ts 와 같음), pdf_page 는 1-based. orig_size 는 PDF 에 박힌 픽셀 크기, "
             "out_size 는 회전 적용 후 긴 변 2560 상한 출력. placed 는 쪽 위 배치(0=정상, 90ccw 등은 세워서 저장, tilt* 는 그대로).",
        settings=dict(long_max=LONG_MAX, quality=QUALITY, min_long=MIN_LONG),
        totals=dict(images_in_pdf=len(rows), extracted=sum(f["count"] for f in folders), skipped=reasons,
                    bytes=sum(f["bytes"] for f in folders)),
        folders=folders,
        skipped=skipped,
    )
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"PDF 내장 이미지 {len(rows)}개 → 추출 {index['totals']['extracted']}장, "
          f"건너뜀 {reasons}, 총 {index['totals']['bytes'] / 1e6:.1f} MB, 실패 {len(failed)}")
    for fo in folders:
        print(f"  {fo['folder']:<42} {fo['count']:>3}장 {fo['bytes'] / 1e6:6.1f} MB")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
