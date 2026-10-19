import { prodDeps } from '../_shared/core.ts';
import { setRoleHandler } from '../_shared/handlers.ts';

Deno.serve(setRoleHandler(prodDeps()));
