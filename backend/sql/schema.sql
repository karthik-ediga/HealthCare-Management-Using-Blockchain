CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('patient', 'doctor', 'administrator') NOT NULL,
  wallet VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patient_profiles (
  user_id INT PRIMARY KEY,
  blood_group VARCHAR(20),
  emergency_contact VARCHAR(100),
  allergies TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS doctor_profiles (
  user_id INT PRIMARY KEY,
  specialty VARCHAR(200),
  license_number VARCHAR(100),
  consultation_fee VARCHAR(50),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  author_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  encrypted_uri VARCHAR(255),
  digest VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  doctor_id INT NOT NULL,
  starts_at DATETIME NOT NULL,
  fee DECIMAL(18,8) DEFAULT 0,
  status ENUM('pending', 'accepted', 'completed', 'cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS access_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  doctor_id INT NOT NULL,
  purpose VARCHAR(255),
  granted BOOLEAN DEFAULT TRUE,
  expires_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS access_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  doctor_id INT NOT NULL,
  reason TEXT,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
);
