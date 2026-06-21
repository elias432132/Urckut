const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'urckut-secret-2026';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Configuração para aceitar uploads de imagens
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configuração do multer para upload de arquivos
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
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|webm|mov/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Apenas imagens e vídeos são permitidos!'));
    }
});

const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialDB = {
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
            comunidades: [
                {
                    id: uuidv4(),
                    nome: 'Eu odeio acordar cedo',
                    imagem: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=150',
                    membros: 1204453,
                    participantes: []
                },
                {
                    id: uuidv4(),
                    nome: 'Programadores da Madrugada',
                    imagem: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=150',
                    membros: 54200,
                    participantes: []
                }
            ],
            marketplace: [
                {
                    id: uuidv4(),
                    titulo: 'Placa RTX',
                    imagem: 'https://images.unsplash.com/photo-1587202372634-32705e3bf49c?w=300',
                    preco: 2400,
                    vendedor: '@Alice_99'
                },
                {
                    id: uuidv4(),
                    titulo: 'Setup Cyberpunk',
                    imagem: 'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?w=300',
                    preco: 5000,
                    vendedor: '@Neo_Store'
                }
            ],
            amigos: [],
            galeria: []
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2));
        return initialDB;
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
}

// AUTH
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, senha, nome } = req.body;
        const db = loadDB();
        
        if (db.users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'Email já cadastrado' });
        }
        
        const hashedSenha = await bcrypt.hash(senha, 10);
        const newUser = {
            id: uuidv4(),
            email,
            nome: nome || email.split('@')[0],
            senha: hashedSenha,
            avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200',
            bio: 'Desenvolvedor de realidades digitais.',
            seguidores: 0,
            seguindo: 0,
            nivel: 'Elite',
            criadoEm: new Date().toISOString()
        };
        
        db.users.push(newUser);
        saveDB(db);
        
        const token = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({
            token,
            user: { id: newUser.id, email: newUser.email, nome: newUser.nome, avatar: newUser.avatar }
        });
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ error: 'Erro ao criar usuário' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        const db = loadDB();
        
        const user = db.users.find(u => u.email === email);
        if (!user) {
            return res.status(400).json({ error: 'Usuário não encontrado' });
        }
        
        const validSenha = await bcrypt.compare(senha, user.senha);
        if (!validSenha) {
            return res.status(400).json({ error: 'Senha incorreta' });
        }
        
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({
            token,
            user: { 
                id: user.id, 
                email: user.email, 
                nome: user.nome, 
                avatar: user.avatar, 
                bio: user.bio 
            }
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro ao fazer login' });
    }
});

// POSTS
app.get('/api/posts', (req, res) => {
    const db = loadDB();
    res.json(db.posts.sort((a, b) => new Date(b.data) - new Date(a.data)));
});

app.post('/api/posts', authenticateToken, (req, res) => {
    const { texto, imagem } = req.body;
    if (!texto || texto.trim() === '') {
        return res.status(400).json({ error: 'Texto não pode ser vazio' });
    }
    
    const db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    
    const newPost = {
        id: uuidv4(),
        usuario: user.nome,
        avatar: user.avatar,
        userId: user.id,
        texto: texto.trim(),
        imagem: imagem || null,
        curtidas: 0,
        comentarios: 0,
        compartilhamentos: 0,
        data: new Date().toISOString(),
        curtidoPor: []
    };
    
    db.posts.unshift(newPost);
    saveDB(db);
    
    res.json(newPost);
});

app.post('/api/posts/:id/curtir', authenticateToken, (req, res) => {
    const db = loadDB();
    const post = db.posts.find(p => p.id === req.params.id);
    
    if (!post) {
        return res.status(404).json({ error: 'Post não encontrado' });
    }
    
    const index = post.curtidoPor.indexOf(req.user.id);
    if (index > -1) {
        post.curtidoPor.splice(index, 1);
        post.curtidas--;
    } else {
        post.curtidoPor.push(req.user.id);
        post.curtidas++;
    }
    
    saveDB(db);
    res.json(post);
});

app.post('/api/posts/:id/compartilhar', authenticateToken, (req, res) => {
    const db = loadDB();
    const post = db.posts.find(p => p.id === req.params.id);
    
    if (!post) {
        return res.status(404).json({ error: 'Post não encontrado' });
    }
    
    post.compartilhamentos++;
    saveDB(db);
    
    res.json(post);
});

// UPLOAD DE ARQUIVOS
app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }
        
        const fileUrl = `/uploads/${req.file.filename}`;
        res.json({ 
            url: fileUrl,
            filename: req.file.filename,
            mimetype: req.file.mimetype
        });
    } catch (error) {
        console.error('Erro no upload:', error);
        res.status(500).json({ error: 'Erro ao fazer upload' });
    }
});

// STORIES
app.get('/api/stories', (req, res) => {
    const db = loadDB();
    // Filtrar stories expirados (24h)
    const now = new Date();
    const activeStories = db.stories.filter(story => new Date(story.expiraEm) > now);
    res.json(activeStories);
});

app.post('/api/stories', authenticateToken, (req, res) => {
    const { texto, imagem } = req.body;
    const db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    
    const newStory = {
        id: uuidv4(),
        usuario: user.nome,
        avatar: user.avatar,
        userId: user.id,
        texto: texto || '',
        imagem: imagem || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
        data: new Date().toISOString(),
        expiraEm: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    
    db.stories.push(newStory);
    saveDB(db);
    
    res.json(newStory);
});

// COMUNIDADES
app.get('/api/comunidades', (req, res) => {
    const db = loadDB();
    res.json(db.comunidades);
});

app.post('/api/comunidades/:id/participar', authenticateToken, (req, res) => {
    const db = loadDB();
    const comunidade = db.comunidades.find(c => c.id === req.params.id);
    
    if (!comunidade) {
        return res.status(404).json({ error: 'Comunidade não encontrada' });
    }
    
    const index = comunidade.participantes.indexOf(req.user.id);
    if (index > -1) {
        comunidade.participantes.splice(index, 1);
        comunidade.membros--;
    } else {
        comunidade.participantes.push(req.user.id);
        comunidade.membros++;
    }
    
    saveDB(db);
    res.json(comunidade);
});

// MARKETPLACE
app.get('/api/marketplace', (req, res) => {
    const db = loadDB();
    res.json(db.marketplace);
});

// USUÁRIOS
app.get('/api/users', authenticateToken, (req, res) => {
    const db = loadDB();
    const users = db.users.map(u => ({
        id: u.id,
        nome: u.nome,
        avatar: u.avatar,
        bio: u.bio,
        seguidores: u.seguidores || 0,
        seguindo: u.seguindo || 0
    }));
    res.json(users);
});

app.get('/api/users/search', authenticateToken, (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) {
        return res.json([]);
    }
    
    const db = loadDB();
    const results = db.users
        .filter(u => 
            u.nome.toLowerCase().includes(q.toLowerCase()) ||
            u.email.toLowerCase().includes(q.toLowerCase())
        )
        .map(u => ({
            id: u.id,
            nome: u.nome,
            avatar: u.avatar,
            bio: u.bio
        }));
    
    res.json(results);
});

// AMIGOS
app.get('/api/amigos', authenticateToken, (req, res) => {
    const db = loadDB();
    const userAmigos = db.amigos.filter(a => 
        a.userId === req.user.id || a.amigoId === req.user.id
    );
    
    const amigosCompletos = userAmigos.map(a => {
        const amigoId = a.userId === req.user.id ? a.amigoId : a.userId;
        const amigo = db.users.find(u => u.id === amigoId);
        return {
            id: a.id,
            amigo: {
                id: amigo.id,
                nome: amigo.nome,
                avatar: amigo.avatar,
                bio: amigo.bio
            },
            status: a.status,
            data: a.data
        };
    });
    
    res.json(amigosCompletos);
});

app.post('/api/amigos/solicitar', authenticateToken, (req, res) => {
    const { amigoId } = req.body;
    const db = loadDB();
    
    if (amigoId === req.user.id) {
        return res.status(400).json({ error: 'Você não pode adicionar a si mesmo' });
    }
    
    const amigo = db.users.find(u => u.id === amigoId);
    if (!amigo) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    const existente = db.amigos.find(a => 
        (a.userId === req.user.id && a.amigoId === amigoId) ||
        (a.userId === amigoId && a.amigoId === req.user.id)
    );
    
    if (existente) {
        return res.status(400).json({ error: 'Solicitação já existe' });
    }
    
    const novaSolicitacao = {
        id: uuidv4(),
        userId: req.user.id,
        amigoId: amigoId,
        status: 'pendente',
        data: new Date().toISOString()
    };
    
    db.amigos.push(novaSolicitacao);
    saveDB(db);    
    res.json(novaSolicitacao);
});

app.post('/api/amigos/:id/aceitar', authenticateToken, (req, res) => {
    const db = loadDB();
    const amizade = db.amigos.find(a => a.id === req.params.id);
    
    if (!amizade) {
        return res.status(404).json({ error: 'Solicitação não encontrada' });
    }
    
    if (amizade.amigoId !== req.user.id) {
        return res.status(403).json({ error: 'Você não pode aceitar esta solicitação' });
    }
    
    amizade.status = 'aceito';
    saveDB(db);
    
    res.json(amizade);
});

app.post('/api/amigos/:id/recusar', authenticateToken, (req, res) => {
    const db = loadDB();
    const index = db.amigos.findIndex(a => a.id === req.params.id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Solicitação não encontrada' });
    }
    
    db.amigos.splice(index, 1);
    saveDB(db);
    
    res.json({ success: true });
});

// MENSAGENS
app.get('/api/mensagens', authenticateToken, (req, res) => {
    const db = loadDB();
    const userId = req.user.id;
    
    const conversas = {};
    
    db.mensagens.forEach(msg => {
        if (msg.remetenteId === userId || msg.destinatarioId === userId) {
            const contatoId = msg.remetenteId === userId ? msg.destinatarioId : msg.remetenteId;
            
            if (!conversas[contatoId]) {
                const contato = db.users.find(u => u.id === contatoId);
                conversas[contatoId] = {
                    contato: {
                        id: contato.id,
                        nome: contato.nome,
                        avatar: contato.avatar
                    },
                    ultimaMensagem: msg,
                    naoLidas: 0
                };
            }
            
            if (msg.destinatarioId === userId && !msg.lida) {
                conversas[contatoId].naoLidas++;
            }
            
            if (new Date(msg.data) > new Date(conversas[contatoId].ultimaMensagem.data)) {
                conversas[contatoId].ultimaMensagem = msg;
            }
        }
    });
    
    res.json(Object.values(conversas));
});

app.get('/api/mensagens/:contatoId', authenticateToken, (req, res) => {
    const db = loadDB();
    const userId = req.user.id;
    const contatoId = req.params.contatoId;
    
    const mensagens = db.mensagens.filter(m => 
        (m.remetenteId === userId && m.destinatarioId === contatoId) ||
        (m.remetenteId === contatoId && m.destinatarioId === userId)
    ).sort((a, b) => new Date(a.data) - new Date(b.data));
    
    mensagens.forEach(m => {
        if (m.destinatarioId === userId) {
            m.lida = true;
        }
    });
    
    saveDB(db);
    
    res.json(mensagens);
});

app.post('/api/mensagens', authenticateToken, (req, res) => {
    const { destinatarioId, texto } = req.body;
    const db = loadDB();
    
    if (!texto || texto.trim() === '') {
        return res.status(400).json({ error: 'Mensagem não pode ser vazia' });
    }
    
    const destinatario = db.users.find(u => u.id === destinatarioId);
    if (!destinatario) {
        return res.status(404).json({ error: 'Destinatário não encontrado' });
    }
    
    const novaMensagem = {
        id: uuidv4(),
        remetenteId: req.user.id,
        destinatarioId: destinatarioId,
        texto: texto.trim(),
        data: new Date().toISOString(),
        lida: false
    };
    
    db.mensagens.push(novaMensagem);
    saveDB(db);
    
    res.json(novaMensagem);
});

// GALERIA
app.get('/api/galeria', authenticateToken, (req, res) => {
    const db = loadDB();
    const userGaleria = db.galeria.filter(g => g.userId === req.user.id);
    res.json(userGaleria.sort((a, b) => new Date(b.data) - new Date(a.data)));
});

app.post('/api/galeria', authenticateToken, (req, res) => {
    const { url, tipo, descricao } = req.body;
    const db = loadDB();
    
    const newItem = {
        id: uuidv4(),
        userId: req.user.id,
        url,
        tipo: tipo || 'imagem',
        descricao: descricao || '',
        data: new Date().toISOString()
    };
    
    db.galeria.push(newItem);
    saveDB(db);
    
    res.json(newItem);
});

app.delete('/api/galeria/:id', authenticateToken, (req, res) => {
    const db = loadDB();
    const index = db.galeria.findIndex(g => g.id === req.params.id && g.userId === req.user.id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Item não encontrado' });
    }
    
    db.galeria.splice(index, 1);
    saveDB(db);
    
    res.json({ success: true });
});

// USUÁRIO
app.get('/api/user/me', authenticateToken, (req, res) => {
    const db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    
    if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    res.json({
        id: user.id,
        email: user.email,
        nome: user.nome,
        avatar: user.avatar,
        bio: user.bio,
        seguidores: user.seguidores || 0,
        seguindo: user.seguindo || 0,
        nivel: user.nivel
    });
});

app.put('/api/user/me', authenticateToken, (req, res) => {
    const { nome, bio, avatar } = req.body;
    const db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    
    if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    if (nome) user.nome = nome;
    if (bio !== undefined) user.bio = bio;
    if (avatar) user.avatar = avatar;
    
    saveDB(db);
    
    res.json({
        id: user.id,
        nome: user.nome,
        avatar: user.avatar,
        bio: user.bio
    });
});

// SERVE FRONTEND - BUSCA INTELIGENTE
app.get('*', (req, res) => {
    // Tenta buscar o index.html na raiz do projeto
    const caminhoArquivo = path.join(__dirname, 'index.html');
    
    if (fs.existsSync(caminhoArquivo)) {
        res.sendFile(caminhoArquivo);
    } else {
        // Se não achar, avisa no log o que aconteceu
        console.error('ERRO: Não achei o arquivo index.html em:', caminhoArquivo);
        res.status(404).send('Arquivo index.html não encontrado no servidor.');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Urckut Server rodando na porta ${PORT}`);
    console.log(`📡 Acesse: http://localhost:${PORT}`);
});
