const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: Number,
  transactionType : String,
  category: String,
  comment: String,
  date: Date
});

module.exports = mongoose.model('Transaction', transactionSchema);
