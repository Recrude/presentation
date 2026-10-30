import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'/presentations/',plugins:[react(),{
  name:'local-capture',
  configureServer(server){
    server.middlewares.use('/presentations/api/publish',async(req,res)=>{
      // @ts-expect-error development-only Node handler
      const {localPublish}=await import('./scripts/local-publish.mjs');
      const {executePublish}=await server.ssrLoadModule('/server/publish.ts');await localPublish(req,res,executePublish);
    });
    server.middlewares.use('/presentations/api/capture',async(req,res)=>{
      // Vite removes the mount prefix; the capture handler only reads the query.
      // @ts-expect-error plain Node handler, also used by Vercel
      const {default:handler}=await import('./api/capture.mjs');await handler(req,res);
    });
  }
}]});
