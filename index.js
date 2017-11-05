var bodyParser = require('body-parser');
var express    = require("express");
var mysql      = require('mysql');
var path       = require("path");

// https://www.npmjs.com/package/promise-mysql
// convert mysql as promise based ORM
// yet async/await didn't worked on connection.query()!
var Promise    = require("bluebird");
var mysql      = Promise.promisifyAll(require('mysql'));

var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

var connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'test',
  password : 'test',
  database : 'nodejs'
});


const processTransaction = async function(from_account, to_account, money) {

  return_data = {
    'success' : false,
    'msg': '',
    'rollback': false,
  }

  // Start Transaction
  await connection.beginTransaction(function(err) {
    if (err) {
      return_data['rollBack'] = true;
      connection.rollback(function() {});
      return return_data;
    }

    // Lock balance rows which we want to update
    connection.query('SELECT * FROM balances WHERE account_nr in (?, ?) FOR UPDATE;', [from_account, to_account], function (error, results, fields) {
      if (error) {
        return_data['rollBack'] = true;
        connection.rollback(function() {});
        return return_data;
      }

      from_account_balance = to_account_balance = null;

      for (var i=0; i < results.length; i++) {
        if (results[i].account_nr == from_account) {
          from_account_balance = results[i].balance;
        }
        if (results[i].account_nr == to_account) {
          to_account_balance = results[i].balance;
        }
      }

      // Check if user have sufficient balance to make the transaction
      if (from_account_balance == null || from_account_balance < money) {
        return_data['msg'] = 'You do not have enough balance in your account to make this transaction.';
        console.log(return_data['msg']);
        connection.rollback(function() {});
        return return_data;
      }

      from_account_new_balance = from_account_balance - money;
      to_account_new_balance = to_account_balance + money;

      // Update sender's account balance
      connection.query('UPDATE balances SET balance = ? where account_nr = ?', [from_account_new_balance, from_account], function (error, results, fields) {
        return_data['rollBack'] = true;
        connection.rollback(function() {});
        return return_data;
      });

      // Update reciever's account balance
      connection.query('UPDATE balances SET balance = ? where account_nr = ?', [to_account_new_balance, to_account], function (error, results, fields) {
        return_data['rollBack'] = true;
        connection.rollback(function() {});
        return return_data;
      });

      // Insert transaction logs
      transactions_data = [-1*money, from_account, money, to_account];
      connection.query('INSERT INTO transactions (amount, account_nr) values(? ,?), (?, ?)', transactions_data, function (error, results, fields) {
        return_data['rollBack'] = true;
        connection.rollback(function() {});
        return return_data;
      });

      // Commit successfull transaction
      connection.commit(function(commit_error) {
        if (commit_error) {
          return_data['rollBack'] = true;
          connection.rollback(function() {});
          return return_data;
        }
        console.log('success!');
        return_data['success'] = true;
        return return_data;
      });

    }); // Locks Block

  }); // Transaction Block

  console.log(return_data);
  return return_data;
}


app.get("/", function(req, res) {
  res.sendFile(path.join(__dirname+'/index.html'));
});


app.post("/transactions", async (req, res, next) => {
  try {
    from_account = req.body.from;
    to_account = req.body.to;
    money = parseFloat(req.body.money);

    const response_data = await processTransaction(from_account, to_account, money);
    res.json(response_data);
  } catch (e) {
    next(e) 
  }
})


app.listen(3000, function () {
  console.log('Server running at http://127.0.0.1:3000/');
});
