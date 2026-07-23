const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./authRoutes');
const signalsRoutes = require('./signalsRoutes');
const chatRoutes = require('./chatRoutes');
const calendarRoutes = require('./calendarRoutes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/signals', signalsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/calendar', calendarRoutes);

app.get('/', (req, res) => {
    res.json({ status: 'BWAlpha AI backend rodando 🚀' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
