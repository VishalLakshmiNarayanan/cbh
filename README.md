# AGNOS AI

## Advanced 3D Diagnosis System

AGNOS AI is a cutting-edge 3D medical diagnosis system designed for interactive anatomical inspection and symptomatology analysis.

### Features
- **3D Anatomical Modeling**: Interactive 3D head and neck model for precise region marking.
- **AI Diagnostics**: Integrated AI (Agnos) that analyzes marked regions and provides concise spoken feedback.
- **Transparency Mode**: Toggle between opaque and transparent views to inspect internal structures like the brain, larynx, and tongue.
- **Voice Synthesis**: Real-time speech generation for AI responses.
- **Exporting**: Ability to export diagnostic reports to PDF.

### Tech Stack
- **Frontend**: React, Three.js (@react-three/fiber, @react-three/drei), Vite
- **UI/UX**: TailwindCSS (or Vanilla CSS in this case), Lucide-React icons
- **AI**: Groq API (LLM), ElevenLabs (TTS), Web Speech API (STT)

### Setup
1. Clone the repository.
2. Install dependencies: `npm install`.
3. Create a `.env` file with your API keys:
   ```env
   VITE_GROQ_API_KEY=your_key
   VITE_ELEVENLABS_API_KEY=your_key
   ```
4. Run the development server: `npm run dev`.
