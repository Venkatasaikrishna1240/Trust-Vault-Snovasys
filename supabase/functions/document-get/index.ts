import { prodDeps } from '../_shared/core.ts';
import { getHandler } from '../_shared/handlers.ts';

Deno.serve(getHandler(prodDeps()));
