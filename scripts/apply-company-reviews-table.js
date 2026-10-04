const { sequelize } = require('../src/models');

const sql = `CREATE TABLE IF NOT EXISTS company_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_company_reviews_order (order_id),
  KEY idx_company_reviews_company_rating (company_id, rating), KEY idx_company_reviews_customer (customer_id),
  CONSTRAINT fk_company_reviews_order FOREIGN KEY (order_id) REFERENCES orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_company_reviews_company FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_company_reviews_customer FOREIGN KEY (customer_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB`;

sequelize.query(sql).then(() => console.log('company_reviews ready')).finally(() => sequelize.close());
