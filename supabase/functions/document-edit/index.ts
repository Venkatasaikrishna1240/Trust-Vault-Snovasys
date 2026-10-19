import { prodDeps } from '../_shared/core.ts';
import { editHandler } from '../_shared/handlers.ts';

Deno.serve(editHandler(prodDeps()));
