import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// TEMPORÁRIO (vamos melhorar depois)
const RAINMAKER_API = "https://api.rainmaker.espressif.com";
const RAINMAKER_TOKEN = process.env.RAINMAKER_TOKEN || "";

app.get("/", (req, res) => {
  res.send("Backend Techrib funcionando 🚀");
});

app.get("/devices", async (req, res) => {
  try {
    const response = await axios.get(`${RAINMAKER_API}/v1/user/nodes`, {
      headers: {
        Authorization: `Bearer ${RAINMAKER_TOKEN}`
      }
    });

    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao buscar devices",
      details: error.response?.data || error.message
    });
  }
});

app.listen(PORT, () => {
  console.log("Servidor rodando...");
});