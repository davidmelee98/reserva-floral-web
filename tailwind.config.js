// Configuración de Tailwind para generar public/estilos-tailwind.css.
// Antes cada página cargaba Tailwind desde cdn.tailwindcss.com, que según la
// documentación de Tailwind es solo para desarrollo (arma los estilos en el
// navegador de cada visitante). Ahora la hoja se genera una vez, al publicar.
// Si agregas clases nuevas en las páginas: npm run css
module.exports = {
  content: ['./public/*.html'],
  theme: {
    extend: {
      fontFamily: { sans: ['Poppins', 'sans-serif'], serif: ['Playfair Display', 'serif'] },
      colors: { brandFuchsia: '#c2185b', brandLightPink: '#e91e63', brandDark: '#353535', brandGray: '#f8f9fa' }
    }
  }
};
