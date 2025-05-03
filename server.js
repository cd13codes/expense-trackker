const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('./models/User');
const Transaction = require('./models/Transaction');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Check env variables
if (!process.env.JWT_SECRET || !process.env.MONGO_URI) {
  console.error('❌ Missing JWT_SECRET or MONGO_URI');
  process.exit(1);
}

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ DB connection failed:', err));

// Signup Route
app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password || password.length < 6) {
    return res.status(400).json({ message: 'Invalid username or password' });
  }

  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return res.status(400).json({ message: 'Username already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new User({ username, password: hashedPassword });
  await newUser.save();
  res.status(201).json({ message: 'Signup successful' });
});

// Login Route
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// JWT Middleware
const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Token missing' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    console.error('JWT Error:', err);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Add Transaction
app.post('/api/transaction', auth, async (req, res) => {
  const { amount, transactionType, category, comment, date } = req.body;

  if (!amount || !transactionType || !category || !comment || !date) {
    return res.status(400).json({ message: 'All fields required' });
  }

  const validTypes = ['Income', 'Spending'];
  if (!validTypes.includes(transactionType)) {
    return res.status(400).json({ message: 'Invalid transaction type' });
  }
  
  // Convert amount to number to ensure consistency
  const numericAmount = parseFloat(amount);
  
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ message: 'Amount must be a positive number' });
  }

  const transaction = new Transaction({
    user: req.userId,
    amount: numericAmount,
    transactionType,
    category,
    comment,
    date
  });

  try {
    await transaction.save();
    
    // Get updated balance after adding transaction
    const transactions = await Transaction.find({ user: req.userId });
    const totalBalance = transactions.reduce((sum, txn) => {
      return txn.transactionType === 'Income'  // FIXED: Use capitalized 'Income' to match frontend
        ? sum + parseFloat(txn.amount)
        : sum - parseFloat(txn.amount);
    }, 0);
    
    res.json({ 
      message: 'Transaction added',
      totalBalance
    });
  } catch (err) {
    console.error('Error adding transaction:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Transactions + Balance + Category Totals
app.get('/api/transactions', auth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.userId }).sort({ date: -1 });

    // Calculate total balance - FIXED: Use capitalized 'Income' to match frontend
    const totalBalance = transactions.reduce((sum, txn) => {
      return txn.transactionType === 'Income'
        ? sum + parseFloat(txn.amount)
        : sum - parseFloat(txn.amount);
    }, 0);

    // Calculate category totals for bar graph
    const categoryTotals = transactions.reduce((totals, txn) => {
      const amount = parseFloat(txn.amount);
      
      if (!totals[txn.category]) {
        totals[txn.category] = 0;
      }
      
      if (txn.transactionType === 'Income') {
        totals[txn.category] += amount;
      } else if (txn.transactionType === 'Spending') {
        totals[txn.category] -= amount;
      }
      
      return totals;
    }, {});

    console.log('Sending balance:', totalBalance);
    console.log('Category totals:', categoryTotals);
    
    res.json({ 
      transactions, 
      totalBalance, 
      categoryTotals 
    });
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete Transaction
app.delete('/api/transaction/:id', auth, async (req, res) => {
  try {
    const deleted = await Transaction.findOneAndDelete({
      _id: req.params.id,
      user: req.userId
    });

    if (!deleted) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.json({ message: 'Transaction deleted successfully' });
  } catch (err) {
    console.error('Delete Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Start Server
const PORT = process.env.PORT || 5501;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));