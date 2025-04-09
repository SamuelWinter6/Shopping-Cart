# 🛒 Shopping Cart Full-Stack Web App

A full-stack shopping cart web application built from scratch using Node.js, Express, MySQL, and EJS templating. This project showcases core backend authentication, product management, cart functionality, and frontend rendering — all powered by a real relational database hosted on Aiven.

---

## 🚀 Features

- 🔐 User Authentication (Register/Login/Logout) using JWT & cookies
- 🛍️ Product listing with images from a joined image table
- 🧾 Add, Edit, and Delete Products (Admin-style CRUD)
- 🛒 Shopping Cart tied to user accounts via UUID
- 🖼️ Dynamic Image Selection for Products (via `ImageMaster`)
- 🔄 Secure API endpoint (`/images`) protected with an API key
- 💾 Real database connection via MySQL (hosted on Aiven)
- 🌐 Responsive frontend using EJS templating and form-based UI
- 📦 Fully functional backend with custom environment-based configuration

---

## 🧱 Tech Stack

| Layer      | Technologies Used                                      |
|------------|--------------------------------------------------------|
| Frontend   | HTML, CSS, EJS                                         |
| Backend    | Node.js, Express                                       |
| Database   | MySQL (Aiven Cloud), MySQL2 driver                     |
| Auth       | JWT (jsonwebtoken), bcryptjs, cookie-parser            |
| Other      | UUID (for carts), dotenv, fs (for SSL cert loading)    |

---

## 🧑‍💻 Getting Started

### 🔧 Prerequisites

- Node.js installed (v18+ recommended)
- MySQL (or access to a remote MySQL instance, e.g., Aiven)
- npm

---

### 🗂️ Setup

1. **Clone the Repository**
   ```bash
   1. git clone https://github.com/yourusername/Shopping-Cart.git
   2. cd Shopping-Cart
   3. install dependencies; mysql, bcrypt, jwt, cookieParser, and dotenv
   4. create secrets: Api & Jwt
   5. create and detail db connection pool; host, port, user, password, db, and ssl ca.perm (if your db requires)

