import { prodDeps } from '../_shared/core.ts';
import { shareHandler } from '../_shared/handlers.ts';

Deno.serve(shareHandler(prodDeps()));
