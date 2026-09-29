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
      colors: {
        // Paleta "Rubor": frambuesa (el color del logo) como acento, rubor en
        // encabezado y pie, tinta berenjena para el texto.
        brandFuchsia: '#A3284F',   // frambuesa: botones y acentos
        brandLightPink: '#B73A61', // frambuesa clara: enlaces y estados hover
        brandDark: '#3A2130',      // tinta
        brandGray: '#FFFAFB',      // fondo
        pink: { 50: '#FCF1F4', 100: '#F8E6EA', 200: '#EFD3DA', 300: '#E2AFBD', 400: '#CE7892', 500: '#B8466B', 600: '#A3284F', 700: '#86203F', 800: '#6A1932', 900: '#521327' }
      }
    }
  }
};
