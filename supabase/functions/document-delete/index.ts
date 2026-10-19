import { prodDeps } from '../_shared/core.ts';
import { deleteHandler } from '../_shared/handlers.ts';

Deno.serve(deleteHandler(prodDeps()));
