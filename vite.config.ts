import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SUPABASE_KEY에는 브라우저 공개가 가능한 publishable key만 사용합니다.
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'SUPABASE_'],
})
