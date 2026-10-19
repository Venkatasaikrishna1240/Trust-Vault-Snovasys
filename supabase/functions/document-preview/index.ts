import { prodDeps } from '../_shared/core.ts';
import { previewHandler } from '../_shared/handlers.ts';

Deno.serve(previewHandler(prodDeps()));
