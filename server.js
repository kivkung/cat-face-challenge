import 'dotenv/config'; 
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';

const app = express();
// ขยายขนาดการรับข้อมูลให้เหมาะสม
app.use(express.json({ limit: '10mb' }));
app.use(cors());

app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:3000', 'https://cat-face-challenger.netlify.app']
}));

if (!process.env.GEMINI_API_KEY) {
  console.error("❌ กรุณาตั้งค่า GEMINI_API_KEY ในไฟล์ .env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('https://cat-face-challenge.onrender.com/api/analyze', async (req, res) => {
  try {
    let { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'ไม่พบข้อมูลรูปภาพ' });
    }

    // 1. ล้างหัว Data URL ออกหากหลุดมาจาก Frontend (เช่น data:image/jpeg;base64,)
    if (imageBase64.includes(',')) {
      imageBase64 = imageBase64.split(',')[1];
    }

    // 2. ล้างอักขระพิเศษส่วนเกินออก
    const cleanBase64 = imageBase64.replace(/[^A-Za-z0-9+/=]/g, '');

    // 3. ป้องกันปัญหา INVALID_ARGUMENT ด้วยการแปลงกลับเป็นโครงสร้าง Buffer object 
    // เพื่อให้ตัว SDK ถอดรหัสไบนารี่ได้อย่างแม่นยำ ไม่เพี้ยนตามลักษณะการเข้ารหัสตัวอักษรของระบบปฏิบัติการ
    const imageBuffer = Buffer.from(cleanBase64, 'base64');

    const prompt = `You are comparing a person's face to a reference cat image.
Reference: The cat has very wide open eyes (one eye more open, one squinting), and a VERY long tongue hanging out dramatically.

Task: Analyze ONLY the EYES and TONGUE in the submitted photo.

Respond ONLY as a raw JSON object (no markdown, no \`\`\`json wrappers). Match this schema precisely:
{
  "score": 0-100,
  "eyes_score": 0-100,
  "tongue_score": 0-100,
  "verdict_th": "ข้อความภาษาไทยไม่เกิน 8 คำ",
  "detail_th": "รายละเอียดภาษาไทยอธิบายสิ่งที่เห็น 2 ประโยค"
}

Be strict: score >= 70 only if both eyes are dramatic AND tongue is clearly out. No tongue visible = tongue_score max 20.`;

    // เรียกใช้ Gemini 2.5 Flash ด้วยการระบุ data ที่ดึงมาจาก Buffer 
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        prompt,
        {
          inlineData: {
            mimeType: 'image/jpeg',
            // 🔥 ใช้คำสั่งดึงค่า string ที่ตรวจสอบความปลอดภัยระดับ Buffer แล้ว
            data: imageBuffer.toString('base64') 
          }
        }
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = response.text.trim();
    res.json(JSON.parse(responseText));

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      score: 0, 
      verdict_th: 'ระบบวิเคราะห์ขัดข้อง', 
      detail_th: 'เซิร์ฟเวอร์เกิดข้อผิดพลาดในการประมวลผลข้อมูลภาพ' 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});