import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#8f3f66',
          hover: '#7a3355',
          light: 'rgba(143, 63, 102, 0.08)',
        },
      },
      borderRadius: {
        'anfaal': '18px',
      },
    },
  },
  plugins: [],
};

export default config;
