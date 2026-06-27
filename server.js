const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');

// --- CONEXÃO MONGODB ---
const MONGO_URI = 'mongodb+srv://adrianogatinho1992g7_db_user:JK7OSNfR6WhgxRxk@cluster0.dwtwrz6.mongodb.net/?appName=Cluster0';

// MUDANÇA: Substituído 'urckut_db' por 'gameverse_db'
const dbSchema = new mongoose.Schema({
    _id: { type: String, default: 'gameverse_db' },
    data: { type: mongoose.Schema.Types.Mixed, default: {} }
});
const DBModel = mongoose.model('Database', dbSchema);

// Dados iniciais limpos (Apenas para o GameVerse, sem comunidades e sem marketplace)
const initialData = {
    users: [],
    posts: [
        {
            id: uuidv4(),
            usuario: 'Pedro Santos',
            avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100',
            texto: 'Alguém tem convite pra comunidade secreta de Mods de Cyberpunk?',
            curtidas: 12,
            comentarios: 3,
            compartilhamentos: 2,
            data: new Date(Date.now() - 7200000).toISOString(),
            curtidoPor: []
        }
    ],
    stories: [],
    mensagens: [],
    amigos: [],
    galeria: []
};

let memoryDB = initialData;
let isDbReady = false; // VARIAVEL DE CONTROLE PARA O COLD START

mongoose.connect(MONGO_URI)
  .then(async () => {
      console.log('✅ Conectado ao MongoDB com sucesso!');
      try {
          const doc = await DBModel.findById('gameverse_db'); // MUDANÇA
          if (doc && doc.data && doc.data.users) {
              memoryDB = doc.data;
              console.log('✅ Banco de dados do GameVerse carregado da nuvem!');
          } else {
              await DBModel.create({ _id: 'gameverse_db', data: memoryDB }); // MUDANÇA
              console.log('✅ Novo banco de dados do GameVerse criado na nuvem!');
          }
          isDbReady = true; // SINALIZA QUE ESTÁ PRONTO PARA RECEBER REQUISIÇÕES
      } catch (err) {
          console.error('Erro ao ler do banco:', err);
      }
  })
  .catch(err => console.error('❌ Erro ao conectar no MongoDB:', err));

function loadDB() {
    return memoryDB;
}

function saveDB(db) {
    memoryDB = db;
    DBModel.updateOne({ _id: 'gameverse_db' }, { data: memoryDB }) // MUDANÇA
        .catch(err => console.error('Erro ao salvar na nuvem:', err));
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'urckut-secret-2026';

// --- CONFIGURAÇÃO DO CLOUDINARY ---
cloudinary.config({
  cloud_name: 'w12p0hsz',
  api_key: '593448241427524',
  api_secret: '5GRgxHsOvepEbejX4xzQR2Q8DUg'
});

// MUDANÇA: CORS focado em Webview
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '250mb' }));
app.use(express.urlencoded({ limit: '250mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MUDANÇA: MIDDLEWARE DE PROTEÇÃO CONTRA O COLD START
app.use((req, res, next) => {
    if (!isDbReady && req.path !== '/api/health') {
        return res.status(503).json({ error: 'Servidor iniciando, tente novamente em alguns segundos...' });
    }
    next();
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 250 * 1024 * 1024 }, // LIMITE MÁXIMO DE 250MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|webm|mov|mp3|wav|ogg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) return cb(null, true);
        cb(new Error('Apenas imagens, vídeos e áudios são permitidos!'));
    }
});

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido' });
        req.user = user;
        next();
    });
}

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- ROTA DE UPLOAD CLOUDINARY (250MB - Upload_Large) ---
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        
        const result = await cloudinary.uploader.upload_large(req.file.path, { 
            resource_type: "auto",
            chunk_size: 6000000 // Divide envios grandes em pedaços de 6MB
        });
        
        fs.unlinkSync(req.file.path);
        res.json({ url: result.secure_url, filename: req.file.filename, mimetype: req.file.mimetype });
    } catch (error) {
        console.error('Erro no Cloudinary:', error);
        res.status(500).json({ error: 'Erro ao enviar para a nuvem' });
    }
});

// ==========================================
// MÓDULO DE AUTENTICAÇÃO (MUDANÇA: Rota de email do Urckut excluída)
// ==========================================

// Rota Mágica de Login (Gameverse e senhas antigas)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { loginId, password, email, senha } = req.body;
        const identificador = loginId || email; 
        const senhaRecebida = password || senha;

        if (!identificador || !senhaRecebida) {
            return res.status(400).json({ error: "Preencha todos os campos!" });
        }

        const db = loadDB();
        
        const user = db.users.find(u => 
            u.email === identificador || 
            u.phone === identificador || 
            u.tag === identificador
        );

        if (!user) {
            return res.status(401).json({ error: "Usuário não encontrado." });
        }

        // MUDANÇA: Proteção de segurança caso o usuário não tenha senha definida
        if (!user.senha) {
            return res.status(401).json({ error: "Esta conta só pode ser acessada via código no celular (OTP)." });
        }

        const validSenha = await bcrypt.compare(senhaRecebida, user.senha);
        if (!validSenha) {
            return res.status(401).json({ error: "Senha incorreta!" });
        }

        const token = jwt.sign({ id: user.id, email: user.email, phone: user.phone }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            token: token,
            user: {
                id: user.id,
                nome: user.nome,
                tag: user.tag || user.nome,
                avatar: user.avatar,
                bio: user.bio,
                email: user.email,
                phone: user.phone
            }
        });

    } catch (error) {
        console.error("Erro no Login:", error);
        res.status(500).json({ error: "Erro interno no servidor" });
    }
});

// Login OTP por Telefone (Gameverse)
app.post('/api/auth/otp', (req, res) => {
    try {
        const { phone, tag } = req.body;
        if (!phone || !tag) return res.status(400).json({ error: 'Telefone e Gamertag são obrigatórios' });
        
        const db = loadDB();
        let user = db.users.find(u => u.phone === phone);
        
        if (!user) {
            user = {
                id: uuidv4(), phone, nome: tag, tag, email: `${phone}@gameverse.local`,
                avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200',
                bio: 'Explorando o GameVerse.', seguidores: 0, seguindo: 0,
                criadoEm: new Date().toISOString()
            };
            db.users.push(user);
            saveDB(db);
        } else {
            user.tag = tag;
            user.nome = tag;
        }

        const token = jwt.sign({ id: user.id, phone: user.phone, nome: user.nome }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, phone: user.phone, nome: user.nome, tag: user.tag, avatar: user.avatar, bio: user.bio } });
    } catch (error) {
        res.status(500).json({ error: 'Erro na autenticação OTP' });
    }
});

// ==========================================
// ROTAS DE POSTS E FEED
// ==========================================
app.get('/api/posts', (req, res) => {
    const db = loadDB();
    res.json(db.posts.sort((a, b) => new Date(b.data || b.time) - new Date(a.data || a.time)));
});

app.post('/api/posts', authenticateToken, (req, res) => {
    const { texto, imagem, type, desc, media, tags, music, title, artist } = req.body;
    const db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    
    const newPost = {
        id: uuidv4(), 
        usuario: user.nome, 
        author: user.nome,
        avatar: user.avatar, 
        authorPic: user.avatar,
        userId: user.id,
        texto: (texto || desc || '').trim(), 
        desc: (desc || texto || '').trim(),
        imagem: imagem || media || null, 
        media: media || imagem || null,
        type: type || (imagem ? 'photo' : 'text'),
        tags: tags || [],
        music: music || null,
        title: title || null,
        artist: artist || null,
        curtidas: 0, 
        likes: 0,
        comentarios: 0, 
        comments: [],
        compartilhamentos: 0, 
        shares: 0,
        data: new Date().toISOString(), 
        time: new Date().toISOString(),
        curtidoPor: []
    };
    db.posts.unshift(newPost);
    saveDB(db);
    res.json(newPost);
});

app.post('/api/posts/:id/curtir', authenticateToken, (req, res) => {
    const db = loadDB();
    const post = db.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post não encontrado' });
    const index = post.curtidoPor.indexOf(req.user.id);
    if (index > -1) { 
        post.curtidoPor.splice(index, 1); 
        if(post.curtidas !== undefined) post.curtidas--; 
        if(post.likes !== undefined) post.likes--; 
    } else { 
        post.curtidoPor.push(req.user.id); 
        if(post.curtidas !== undefined) post.curtidas++; 
        if(post.likes !== undefined) post.likes++; 
    }
    saveDB(db);
    res.json(post);
});

app.post('/api/posts/:id/compartilhar', authenticateToken, (req, res) => {
    const db = loadDB();
    const post = db.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post não encontrado' });
    if(post.compartilhamentos !== undefined) post.compartilhamentos++;
    if(post.shares !== undefined) post.shares++;
    saveDB(db);
    res.json(post);
});

app.post('/api/posts/:id/comentar', authenticateToken, (req, res) => {
    const { text, emoji } = req.body;
    if (!text) return res.status(400).json({ error: 'Comentário vazio' });
    const db = loadDB();
    const post = db.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post não encontrado' });
    const user = db.users.find(u => u.id === req.user.id);
    
    const novoComentario = {
        id: uuidv4(), author: user.nome, emoji: emoji || '🎮', text, time: new Date().toISOString()
    };
    
    if(!post.comments) post.comments = [];
    post.comments.push(novoComentario);
    if(post.comentarios !== undefined) post.comentarios++;
    saveDB(db);
    res.json(post);
});

// ==========================================
// STORIES E STATUS
// ==========================================
app.get('/api/stories', (req, res) => {
    const db = loadDB();
    const now = new Date();
    res.json(db.stories.filter(story => new Date(story.expiraEm) > now));
});

app.post('/api/stories', authenticateToken, (req, res) => {
    const { texto, imagem, type, media } = req.body;
    const db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    const newStory = {
        id: uuidv4(), usuario: user.nome, author: user.nome, avatar: user.avatar, userId: user.id,
        texto: texto || '', imagem: imagem || media || null, mediaType: type || 'image',
        data: new Date().toISOString(), expiraEm: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    db.stories.push(newStory);
    saveDB(db);
    res.json(newStory);
});

// ==========================================
// USUÁRIOS E AMIGOS
// ==========================================
app.get('/api/users', authenticateToken, (req, res) => {
    const db = loadDB();
    res.json(db.users.map(u => ({ id: u.id, nome: u.nome, tag: u.tag, avatar: u.avatar, bio: u.bio, seguidores: u.seguidores || 0, seguindo: u.seguindo || 0 })));
});

app.get('/api/users/search', authenticateToken, (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const db = loadDB();
    res.json(db.users.filter(u => u.nome.toLowerCase().includes(q.toLowerCase()) || (u.email && u.email.toLowerCase().includes(q.toLowerCase())))
        .map(u => ({ id: u.id, nome: u.nome, tag: u.tag, avatar: u.avatar, bio: u.bio })));
});

app.get('/api/user/me', authenticateToken, (req, res) => {
    const db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ id: user.id, email: user.email, nome: user.nome, tag: user.tag || user.nome, phone: user.phone, avatar: user.avatar, bio: user.bio, seguidores: user.seguidores || 0, seguindo: user.seguindo || 0, nivel: user.nivel });
});

app.put('/api/user/me', authenticateToken, (req, res) => {
    const { nome, tag, bio, avatar } = req.body;
    const db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (nome) user.nome = nome;
    if (tag) { user.tag = tag; user.nome = tag; }
    if (bio !== undefined) user.bio = bio;
    if (avatar) user.avatar = avatar;
    saveDB(db);
    res.json({ id: user.id, nome: user.nome, tag: user.tag, avatar: user.avatar, bio: user.bio });
});

app.get('/api/amigos', authenticateToken, (req, res) => {
    const db = loadDB();
    const userAmigos = db.amigos.filter(a => (a.userId === req.user.id || a.amigoId === req.user.id) && a.status === 'aceito');
    res.json(userAmigos.map(a => {
        const amigoId = a.userId === req.user.id ? a.amigoId : a.userId;
        const amigo = db.users.find(u => u.id === amigoId);
        return { id: a.id, amigo: { id: amigo.id, nome: amigo.nome, tag: amigo.tag, avatar: amigo.avatar, bio: amigo.bio }, status: a.status, data: a.data };
    }));
});

app.post('/api/amigos/solicitar', authenticateToken, (req, res) => {
    const { amigoId } = req.body;
    const db = loadDB();
    if (amigoId === req.user.id) return res.status(400).json({ error: 'Você não pode adicionar a si mesmo' });
    const amigo = db.users.find(u => u.id === amigoId);
    if (!amigo) return res.status(404).json({ error: 'Usuário não encontrado' });
    const existente = db.amigos.find(a => (a.userId === req.user.id && a.amigoId === amigoId) || (a.userId === amigoId && a.amigoId === req.user.id));
    if (existente) return res.status(400).json({ error: 'Solicitação já existe' });
    const novaSolicitacao = { id: uuidv4(), userId: req.user.id, amigoId, status: 'pendente', data: new Date().toISOString() };
    db.amigos.push(novaSolicitacao);
    saveDB(db);    
    res.json(novaSolicitacao);
});

// ==========================================
// MENSAGENS E GALERIA
// ==========================================
app.get('/api/mensagens', authenticateToken, (req, res) => {
    const db = loadDB();
    const conversas = {};
    db.mensagens.forEach(msg => {
        if (msg.remetenteId === req.user.id || msg.destinatarioId === req.user.id) {
            const contatoId = msg.remetenteId === req.user.id ? msg.destinatarioId : msg.remetenteId;
            if (!conversas[contatoId]) {
                const contato = db.users.find(u => u.id === contatoId);
                if(contato) {
                    conversas[contatoId] = { contato: { id: contato.id, nome: contato.nome, avatar: contato.avatar }, ultimaMensagem: msg, naoLidas: 0 };
                }
            }
            if (conversas[contatoId]) {
                if (msg.destinatarioId === req.user.id && !msg.lida) conversas[contatoId].naoLidas++;
                if (new Date(msg.data) > new Date(conversas[contatoId].ultimaMensagem.data)) conversas[contatoId].ultimaMensagem = msg;
            }
        }
    });
    res.json(Object.values(conversas));
});

app.get('/api/mensagens/:contatoId', authenticateToken, (req, res) => {
    const db = loadDB();
    const userId = req.user.id;
    const contatoId = req.params.contatoId;
    const mensagens = db.mensagens.filter(m => (m.remetenteId === userId && m.destinatarioId === contatoId) || (m.remetenteId === contatoId && m.destinatarioId === userId))
        .sort((a, b) => new Date(a.data) - new Date(b.data));
    mensagens.forEach(m => { if (m.destinatarioId === userId) m.lida = true; });
    saveDB(db);
    res.json(mensagens);
});

app.post('/api/mensagens', authenticateToken, (req, res) => {
    const { destinatarioId, texto } = req.body;
    const db = loadDB();
    if (!texto || texto.trim() === '') return res.status(400).json({ error: 'Mensagem vazia' });
    if (!db.users.find(u => u.id === destinatarioId)) return res.status(404).json({ error: 'Destinatário não encontrado' });
    const novaMensagem = { id: uuidv4(), remetenteId: req.user.id, destinatarioId, texto: texto.trim(), data: new Date().toISOString(), lida: false };
    db.mensagens.push(novaMensagem);
    saveDB(db);
    res.json(novaMensagem);
});

app.get('/api/galeria', authenticateToken, (req, res) => {
    const db = loadDB();
    res.json(db.galeria.filter(g => g.userId === req.user.id).sort((a, b) => new Date(b.data) - new Date(a.data)));
});

app.post('/api/galeria', authenticateToken, (req, res) => {
    const { url, tipo, descricao } = req.body;
    const db = loadDB();
    const newItem = { id: uuidv4(), userId: req.user.id, url, tipo: tipo || 'imagem', descricao: descricao || '', data: new Date().toISOString() };
    db.galeria.push(newItem);
    saveDB(db);
    res.json(newItem);
});

// ==========================================
// SERVIR FRONTEND EXCLUSIVO: GAMEVERSE
// ==========================================
app.get('*', (req, res) => {
    // MUDANÇA: Exibe apenas o GameVerse em qualquer rota acessada
    // DICA: Se você tiver salvo o arquivo HTML principal como 'index.html', mude 'gameverse.html' abaixo para 'index.html'
    const caminhoArquivo = path.join(__dirname, 'gameverse.html'); 
    
    if (fs.existsSync(caminhoArquivo)) {
        res.sendFile(caminhoArquivo);
    } else {
        res.status(404).send('🎮 Erro: Arquivo do GameVerse não encontrado no servidor. Verifique o nome do arquivo HTML.');
    }
});

app.use((err, req, res, next) => {
    console.error('Erro:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
