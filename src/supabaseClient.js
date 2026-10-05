import { createClient } from '@supabase/supabase-js'

// Preencha essas variáveis no arquivo .env (veja .env.example)
// e configure as mesmas variáveis no painel do Netlify em
// Site settings > Environment variables.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase não configurado: preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
