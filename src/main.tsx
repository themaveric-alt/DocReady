import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/plus-jakarta-sans/wght.css'
import '@fontsource-variable/sora/wght.css'
import '@fontsource/noto-sans-devanagari/400.css'
import './styles.css'
import './features/translation/translation.css'
import App from './App'
import BrandSplash from './components/BrandSplash'
import './styles/home-matte.css'
import './styles/navigation-surfaces.css'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <div id="app-surface"><App /></div>
      <BrandSplash />
    </BrowserRouter>
  </StrictMode>,
)
