import { defineConfig } from '../desktop/node_modules/vite/dist/node/index.js';
import react from '../desktop/node_modules/@vitejs/plugin-react/dist/index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({root,base:'./',plugins:[react()],resolve:{alias:{react:path.resolve(root,'../desktop/node_modules/react'),'react-dom':path.resolve(root,'../desktop/node_modules/react-dom')}},build:{outDir:'../android/app/src/main/assets',emptyOutDir:true}});
