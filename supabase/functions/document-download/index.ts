import { prodDeps } from '../_shared/core.ts';
import { downloadHandler } from '../_shared/handlers.ts';

Deno.serve(downloadHandler(prodDeps()));
