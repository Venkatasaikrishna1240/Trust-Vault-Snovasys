import { prodDeps } from '../_shared/core.ts';
import { adminUsersHandler } from '../_shared/handlers.ts';

Deno.serve(adminUsersHandler(prodDeps()));
