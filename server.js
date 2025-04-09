const fs = require("fs");
const express = require("express");
const bodyParser = require("body-parser");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { v4: uuidv4 } = require("uuid");
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const API_KEY = process.env.API_KEY;

const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: {
    ca: fs.readFileSync(process.env.DB_CA_PATH),
  }
});

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cookieParser());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect("/login");

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.redirect("/login");
    req.user = user;
    next();
  });
}

app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
    const { name, email, phone, password } = req.body;

    try {
        pool.query('SELECT * FROM Users WHERE email = ?', [email], async (err, results) => {
            if (err) throw err;

            if (results.length > 0) {
                return res.redirect('/login');
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            pool.query(
              'INSERT INTO Users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
                [name, email, phone, hashedPassword],
                (err, result) => {
                    if (err) throw err;
                    console.log('User registered with ID:', result.insertId);
                    return res.redirect('/login');
                }
            );
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).send('Something went wrong.');
    }
});

app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  console.log("Login Attempt");
  console.log("Email submitted:", email);
  console.log("Raw password submitted:", password);

  pool.query("SELECT * FROM Users WHERE email = ?", [email], (err, results) => {
    if (err) {
      console.log("Database error:", err);
      return res.render("login", { error: "Database error" });
    }

    if (results.length === 0) {
      console.log("No user found for:", email);
      return res.render("login", { error: "Invalid email or password" });
    }

    const user = results[0];
    const storedHash = user.password_hash;

    console.log("🗄️ Stored hash from DB:", storedHash);

    bcrypt.compare(password, storedHash, (err, isMatch) => {
      if (err) {
        console.error("Bcrypt comparison error:", err);
        return res.render("login", { error: "Encryption error" });
      }

      console.log("🔎 Password match result:", isMatch);

      if (isMatch) {
        console.log("Login successful for:", email);
        const token = jwt.sign(
          { email: user.email, name: user.name },
          JWT_SECRET,
          { expiresIn: "30m" }
        );        
        res.cookie("token", token, { httpOnly: true });
        return res.redirect("/");
      } else {
        console.warn("Password mismatch.");
        return res.render("login", { error: "Password mismatch. Try again." });
      }
    });
  });
});

app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.clearCookie("cartId");
  res.redirect("/login");
});

app.get("/", authenticateToken, (req, res) => {
  pool.query(
    `SELECT P.*, IM.imageURL 
     FROM Products P 
     LEFT JOIN ImageMaster IM ON P.imageID = IM.imageID`,
    (err, results) => {
      if (err) {
        return res.render("error", { error: err.message });
      }
      res.render("index", {
        products: results,
        user: req.user,
        cookies: req.cookies
      });
    }
  );
});

app.get("/new", authenticateToken, (req, res) => {
  pool.query("SELECT * FROM ImageMaster", (err, results) => {
    if (err) return res.render("error", { error: err.message });
    res.render("new", { images: results });
  });
});

app.post("/new", authenticateToken, (req, res) => {
  const { name, price, description, imageID } = req.body;
  const sql = "INSERT INTO Products (prod_name, price, description, imageID) VALUES (?, ?, ?, ?)";
  pool.query(sql, [name, price, description, imageID || null], (err, result) => {
    if (err) return res.render("error", { error: err.message });
    res.redirect("/");
  });
});

app.get("/edit/:id", authenticateToken, (req, res) => {
  const productId = req.params.id;

  const productQuery = `
    SELECT P.*, IM.imageURL 
    FROM Products P 
    LEFT JOIN ImageMaster IM ON P.imageID = IM.imageID
    WHERE P.product_id = ?`;

  const imageQuery = "SELECT * FROM ImageMaster";

  pool.query(productQuery, [productId], (err, productResults) => {
    if (err || productResults.length === 0) {
      return res.render("error", { error: "Product not found." });
    }

    pool.query(imageQuery, (err2, imageResults) => {
      if (err2) return res.render("error", { error: err2.message });

      res.render("edit", {
        product: productResults[0],
        images: imageResults
      });
    });
  });
});

app.get("/cart", authenticateToken, (req, res) => {
  const email = req.user.email;

  pool.query("SELECT user_id FROM Users WHERE email = ?", [email], (err, userResults) => {
    if (err || userResults.length === 0) {
      return res.render("error", { error: "User not found for cart." });
    }

    const userId = userResults[0].user_id;

    pool.query("SELECT cart_id FROM Cart WHERE user_id = ?", [userId], (err, cartResults) => {
      if (err || cartResults.length === 0) {
        return res.render("cart", { cartItems: [] });
      }

      const cartId = cartResults[0].cart_id;

      const sql = `
        SELECT CD.detail_id, CD.quantity, P.prod_name, P.price
        FROM Cart_Detail CD
        JOIN Products P ON CD.product_id = P.product_id
        WHERE CD.cart_id = ?
      `;

      pool.query(sql, [cartId], (err, cartItems) => {
        if (err) return res.render("error", { error: err.message });

        res.render("cart", { cartItems });
      });
    });
  });
});

app.post("/edit", authenticateToken, (req, res) => {
  const { id, name, price, description, imageID } = req.body;
  const sql = `
    UPDATE Products
    SET prod_name = ?, price = ?, description = ?, imageID = ?
    WHERE product_id = ?`;

  pool.query(sql, [name, price, description, imageID || null, id], (err, result) => {
    if (err) return res.render("error", { error: err.message });
    res.redirect("/");
  });
});

app.post("/delete", authenticateToken, (req, res) => {
  const { id } = req.body;
  const sql = "DELETE FROM Products WHERE product_id = ?";
  pool.query(sql, [id], (err, result) => {
    if (err) return res.render("error", { error: err.message });
    res.redirect("/");
  });
});

app.post("/add-to-cart", authenticateToken, (req, res) => {
  const { product_id, quantity } = req.body;
  const email = req.user.email;

  pool.query("SELECT user_id FROM Users WHERE email = ?", [email], (err, userResults) => {
    if (err || userResults.length === 0) {
      return res.status(500).send("User not found.");
    }

    const userId = userResults[0].user_id;
    const cartIdFromCookie = req.cookies.cartId;

    const handleCartDetail = (cartId) => {
      pool.query(
        "SELECT * FROM Cart_Detail WHERE cart_id = ? AND product_id = ?",
        [cartId, product_id],
        (err, detailResults) => {
          if (err) return res.status(500).send("Cart detail lookup failed.");

          if (detailResults.length > 0) {
            const newQty = parseInt(detailResults[0].quantity) + parseInt(quantity);
            pool.query(
              "UPDATE Cart_Detail SET quantity = ? WHERE detail_id = ?",
              [newQty, detailResults[0].detail_id],
              (err) => {
                if (err) return res.status(500).send("Update failed.");
                return res.redirect("/");
              }
            );
          } else {
            pool.query(
              "INSERT INTO Cart_Detail (cart_id, product_id, quantity) VALUES (?, ?, ?)",
              [cartId, product_id, quantity],
              (err) => {
                if (err) return res.status(500).send("Insert failed.");
                return res.redirect("/");
              }
            );
          }
        }
      );
    };

    if (cartIdFromCookie) {
      return handleCartDetail(cartIdFromCookie);
    }

    pool.query("SELECT cart_id FROM Cart WHERE user_id = ?", [userId], (err, cartResults) => {
      if (err) return res.status(500).send("Cart lookup failed.");

      if (cartResults.length > 0) {
        const existingCartId = cartResults[0].cart_id;
        res.cookie("cartId", existingCartId, { httpOnly: true });
        return handleCartDetail(existingCartId);
      }

      const newCartId = uuidv4();
      pool.query("INSERT INTO Cart (cart_id, user_id) VALUES (?, ?)", [newCartId, userId], (err2) => {
        if (err2) return res.status(500).send("Failed to create cart.");

        res.cookie("cartId", newCartId, { httpOnly: true });
        return handleCartDetail(newCartId);
      });
    });
  });
});

app.post("/cart/update", authenticateToken, (req, res) => {
  const { remove } = req.body;

  const updates = {};
  for (const key in req.body) {
    if (key.startsWith("quantities.")) {
      const detailId = key.split(".")[1];
      updates[detailId] = parseInt(req.body[key]);
    }
  }


  if (remove) {
    pool.query("DELETE FROM Cart_Detail WHERE detail_id = ?", [remove], (err) => {
      if (err) {
        return res.status(500).send("Failed to remove.");
      }
      return res.redirect("/cart");
    });
  } else {
    const updatePromises = Object.entries(updates).map(([detailId, quantity]) => {
      return new Promise((resolve, reject) => {
        pool.query(
          "UPDATE Cart_Detail SET quantity = ? WHERE detail_id = ?",
          [quantity, detailId],
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
    });

    Promise.all(updatePromises)
      .then(() => res.redirect("/cart"))
      .catch((err) => {
        res.status(500).send("Failed to update cart.");
      });
  }
});

app.get("/images", (req, res) => {
  const userKey = req.query.apiKey;
  if (userKey !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  pool.query("SELECT * FROM ImageMaster", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
