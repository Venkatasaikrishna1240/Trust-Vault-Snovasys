import { prodDeps } from '../_shared/core.ts';
import { auditQueryHandler } from '../_shared/handlers.ts';

Deno.serve(auditQueryHandler(prodDeps()));
