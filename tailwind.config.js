/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        mata: {
          bark: '#3B2417',      // tronco / marrom profundo (base)
          copper: '#B0673A',    // cobre — cor de destaque da marca
          clay: '#8C5A3C',
          gold: '#C9A15A',      // dourado sutil de acabamento
          moss: '#5C6E4A',      // verde folha, usado nos fitoterápicos
          cream: '#F7F1E6',     // fundo claro
          sand: '#EDE3D3',
          ink: '#241811'
        }
      },
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif']
      }
    },
  },
  plugins: [],
}
