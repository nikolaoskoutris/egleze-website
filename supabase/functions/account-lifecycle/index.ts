import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { createAppleService } from './apple.mjs';
import { createHandler } from './handler.mjs';

const env = (name: string) => Deno.env.get(name) || '';
Deno.serve(createHandler({ createClient, env, apple: createAppleService({ env }) }));
