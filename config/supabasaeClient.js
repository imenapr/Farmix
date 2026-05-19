import {createClient} from '@supabase/supabase-js'

const supabaseUrl = ProcessingInstruction.env.SUPABASE_URL
const supabaseKey = ProcessingInstruction.env.SUPABASE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

export default supabase