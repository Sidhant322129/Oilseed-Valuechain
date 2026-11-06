import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.resolve(__dirname, '../SETUP_AND_DEPENDENCIES_GUIDE.pdf');

const doc = new PDFDocument({ margin: 40, size: 'A4' });
const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

// Styling constants
const GOLD = '#E5A93C';
const FOREST = '#14291F';
const TEXT_COLOR = '#222222';
const MUTED = '#555555';
const CODE_BG = '#F0F3F6';

// Header
doc.rect(40, 40, doc.page.width - 80, 55).fill(FOREST);
doc.fillColor(GOLD).fontSize(16).font('Helvetica-Bold').text('NMEO-OP | Oilseed Value Chain Platform', 55, 52);
doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica').text('Complete Setup, Dependencies & Execution Guide (React + JavaScript)', 55, 72);

doc.moveDown(3);

// Section 1: Prerequisites
doc.fillColor(FOREST).fontSize(13).font('Helvetica-Bold').text('1. System Prerequisites');
doc.moveDown(0.3);
doc.fillColor(TEXT_COLOR).fontSize(9.5).font('Helvetica');
doc.text('• Node.js: v18.0.0 or v20.x+ LTS (https://nodejs.org)');
doc.text('• npm: v9.x or v10.x+ (bundled with Node.js)');
doc.text('• Git: Any recent version (https://git-scm.com)');
doc.text('• Web Browser: Google Chrome, Microsoft Edge, Brave, or Firefox');

doc.moveDown(1);

// Section 2: Dependencies List
doc.fillColor(FOREST).fontSize(13).font('Helvetica-Bold').text('2. React + JavaScript Dependencies (package.json)');
doc.moveDown(0.3);

const dependencies = [
  { name: 'react (^19.2.8)', desc: 'Core React 19 UI component framework' },
  { name: 'react-dom (^19.2.8)', desc: 'React DOM rendering package for web browsers' },
  { name: 'react-router-dom (^7.18.3)', desc: 'Client-side routing and multi-page navigation' },
  { name: '@supabase/supabase-js (^2.49.1)', desc: 'Supabase client for Auth, PostgreSQL DB, and file storage' },
  { name: 'lucide-react (^0.475.0)', desc: 'Modern icons for agricultural & value-chain interfaces' },
  { name: 'recharts (^3.10.1)', desc: 'Interactive charts for AI price/demand forecasting' },
  { name: 'leaflet (^1.9.4) & react-leaflet', desc: 'OpenStreetMap engine for regional crop health maps' },
  { name: 'axios (^1.20.0)', desc: 'HTTP client for ML microservices & REST APIs' },
  { name: 'vite (^8.2.2)', desc: 'Ultra-fast build tool and development server (devDependency)' },
  { name: '@vitejs/plugin-react (^6.1.1)', desc: 'Official Vite React JSX compiler & fast refresh plugin' }
];

dependencies.forEach((dep) => {
  doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(9).text(`• ${dep.name}: `, { continued: true });
  doc.fillColor(TEXT_COLOR).font('Helvetica').fontSize(9).text(dep.desc);
});

doc.moveDown(1);

// Section 3: Commands
doc.fillColor(FOREST).fontSize(13).font('Helvetica-Bold').text('3. Step-by-Step Installation & Run Commands');
doc.moveDown(0.4);

function addCodeBlock(title, code) {
  doc.fillColor(TEXT_COLOR).font('Helvetica-Bold').fontSize(9.5).text(title);
  doc.moveDown(0.2);
  const y = doc.y;
  doc.rect(40, y, doc.page.width - 80, 22).fill(CODE_BG);
  doc.fillColor('#000000').font('Courier').fontSize(9).text(code, 50, y + 6);
  doc.moveDown(0.8);
}

addCodeBlock('Step 1: Clone Repository', 'git clone https://github.com/your-repo/Oilseed-valueChain.git');
addCodeBlock('Step 2: Enter Project Directory', 'cd Oilseed-valueChain');
addCodeBlock('Step 3: Install All Dependencies', 'npm install');
addCodeBlock('Step 4: Start Development Server', 'npm run dev');
addCodeBlock('Step 5: Build for Production', 'npm run build');

doc.moveDown(0.5);

// Section 4: Environment Variables
doc.fillColor(FOREST).fontSize(13).font('Helvetica-Bold').text('4. Environment Variables Configuration (.env.local)');
doc.moveDown(0.3);
doc.fillColor(TEXT_COLOR).font('Helvetica').fontSize(9).text('Create a file named .env.local in the root folder with:');
doc.moveDown(0.2);

const envText = 
`VITE_SUPABASE_URL=https://aiobuyiuarozsbfzonam.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here
VITE_STORAGE_CROP_IMAGES_BUCKET=crop-images
VITE_STORAGE_DOCUMENTS_BUCKET=documents
VITE_STORAGE_ML_MODELS_BUCKET=ml-models`;

const envY = doc.y;
doc.rect(40, envY, doc.page.width - 80, 65).fill('#F8F9FA');
doc.fillColor('#24292E').font('Courier').fontSize(8.5).text(envText, 50, envY + 6);

doc.moveDown(4.5);

// Section 5: Database & Auth Setup
doc.fillColor(FOREST).fontSize(13).font('Helvetica-Bold').text('5. Database & Auth Setup in Supabase');
doc.moveDown(0.3);
doc.fillColor(TEXT_COLOR).font('Helvetica').fontSize(9);
doc.text('1. Open Supabase Dashboard -> SQL Editor -> New Query.');
doc.text('2. Run supabase/migrations/00000_complete_week1_schema.sql to create all 14 tables.');
doc.text('3. Run supabase/auth_trigger.sql to configure controlled Sign Up vs Sign In RLS.');
doc.text('4. In Supabase Authentication -> SMTP Settings, configure Gmail SMTP (smtp.gmail.com : 587).');

doc.moveDown(1);
doc.fillColor(MUTED).fontSize(8).font('Helvetica-Oblique').text('Generated for NMEO-OP AI-Enabled Oilseed Value Chain Platform.', { align: 'center' });

doc.end();

writeStream.on('finish', () => {
  console.log('PDF generated successfully at:', outputPath);
});
