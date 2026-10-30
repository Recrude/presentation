import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'/presentations/',plugins:[react(),{
  name:'local-capture',
  configureServer(server){
    server.middlewares.use('/presentations/api/github',async(req,res)=>{
      // @ts-expect-error development-only Node handler
      const {localGitHub}=await import('./scripts/local-github.mjs');await localGitHub(req,res);
    });
    server.middlewares.use('/presentations/api/capture',async(req,res)=>{
      // Vite removes the mount prefix; the capture handler only reads the query.
      // @ts-expect-error plain Node handler, also used by Vercel
      const {default:handler}=await import('./api/capture.mjs');await handler(req,res);
    });
  }
}]});
