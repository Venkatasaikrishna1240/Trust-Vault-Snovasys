import { prodDeps } from '../_shared/core.ts';
import { uploadHandler } from '../_shared/handlers.ts';

Deno.serve(uploadHandler(prodDeps()));
