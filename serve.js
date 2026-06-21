const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'urckut-secret-2026';

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Aumentado para suportar fotos em base64
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialDB = {
            users: [],
            posts: [],
            stories: [],
            mensagens: [],
            galeria: [], // Novo: Galeria de fotos e vídeos
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
            ]
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
            amigos: [], // Novo array de amigos
            nivel: 'Elite',
            criadoEm: new Date().toISOString()
        };
        
        db.users.push(newUser);
        saveDB(db);
        
        const token = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({
            token,
            user: { id: newUser.id, email: newUser.email, nome: newUser.nome, avatar: newUser.avatar, amigos: [] }
        });
    } catch (error) {
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
            user: { id: user.id, email: user.email, nome: user.nome, avatar: user.avatar, bio: user.bio, amigos: user.amigos || [] }
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao fazer login' });
    }
});

// USUÁRIOS & AMIGOS
app.get('/api/users', authenticateToken, (req, res) => {
    const db = loadDB();
    const users = db.users.map(u => ({ id: u.id, nome: u.nome, avatar: u.avatar }));
    res.json(users);
});

app.post('/api/users/:id/amigo', authenticateToken, (req, res) => {
    const db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    const targetUserId = req.params.id;
    
    if (user.id === targetUserId) return res.status(400).json({ error: 'Não pode adicionar a si mesmo' });
    
    if (!user.amigos) user.amigos = [];
    const index = user.amigos.indexOf(targetUserId);
    
    if (index > -1) {
        user.amigos.splice(index, 1); // Remove amigo
    } else {
        user.amigos.push(targetUserId); // Adiciona amigo
    }
    
    saveDB(db);
    res.json({ amigos: user.amigos });
});

// POSTS
app.get('/api/posts', authenticateToken, (req, res) => {
    const db = loadDB();
    res.json(db.posts.sort((a, b) => new Date(b.data) - new Date(a.data)));
});

app.post('/api/posts', authenticateToken, (req, res) => {
    const { texto, imagem } = req.body;
    if (!texto && !imagem) {
        return res.status(400).json({ error: 'Conteúdo não pode ser vazio' });
    }
    
    const db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    
    const newPost = {
        id: uuidv4(),
        usuario: user.nome,
        avatar: user.avatar,
        userId: user.id,
        texto: texto ? texto.trim() : '',
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
    if (!post) return res.status(404).json({ error: 'Post não encontrado' });
    
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

// GALERIA
app.get('/api/galeria', authenticateToken, (req, res) => {
    const db = loadDB();
    res.json(db.galeria.sort((a, b) => new Date(b.data) - new Date(a.data)));
});

app.post('/api/galeria', authenticateToken, (req, res) => {
    const { url, tipo } = req.body;
    const db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    
    const novoItem = {
        id: uuidv4(),
        userId: user.id,
        usuario: user.nome,
        url,
        tipo: tipo || 'imagem',
        data: new Date().toISOString()
    };
    
    db.galeria.unshift(novoItem);
    saveDB(db);
    res.json(novoItem);
});

// MENSAGENS (CHAT)
app.get('/api/mensagens/:userId', authenticateToken, (req, res) => {
    const db = loadDB();
    const targetId = req.params.userId;
    const msgs = db.mensagens.filter(m => 
        (m.de === req.user.id && m.para === targetId) || 
        (m.de === targetId && m.para === req.user.id)
    );
    res.json(msgs);
});

app.post('/api/mensagens', authenticateToken, (req, res) => {
    const { para, texto } = req.body;
    const db = loadDB();
    
    const msg = {
        id: uuidv4(),
        de: req.user.id,
        para,
        texto,
        data: new Date().toISOString()
    };
    
    db.mensagens.push(msg);
    saveDB(db);
    res.json(msg);
});

// COMUNIDADES E MARKETPLACE
app.get('/api/comunidades', authenticateToken, (req, res) => {
    const db = loadDB();
    res.json(db.comunidades);
});

app.get('/api/marketplace', authenticateToken, (req, res) => {
    const db = loadDB();
    res.json(db.marketplace);
});

// SERVE FRONTEND
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Urckut Server rodando na porta ${PORT}`);
    console.log(`📡 Acesse: http://localhost:${PORT}`);
});
