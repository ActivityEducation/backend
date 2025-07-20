# **NestJS ActivityPub Implementation**

This project provides a **toy implementation** of the ActivityPub protocol using Node.js with the NestJS framework. It's designed as a **modular monolith**, leveraging PostgreSQL for persistent data storage and Redis with BullMQ for asynchronous job processing and caching.  
The primary goal is to demonstrate a functional ActivityPub server that can federate with other instances in the Fediverse, handling common activities like follows, posts, likes, and more, with a focus on demonstrating core concepts.

## **✨ Features**

* **ActivityPub Core Implementation:**  
  * **WebFinger:** User discovery (.well-known/webfinger).  
  * **Actor Profiles:** Serving actor profiles (/actors/:username).  
  * **Inboxes & Outboxes:** Handling incoming and outgoing activities (/actors/:username/inbox, /actors/:username/outbox).  
  * **Collections:** Followers, Following, and Liked collections.  
  * **Content Objects:** Storage and retrieval of various content types (e.g., Note).  
  * **NodeInfo 1.0 & 2.0:** Instance metadata for discovery.  
* **Activity Types Supported:**  
  * Follow / Accept / Reject (for follows)  
  * Create (for new content objects like Notes)  
  * Announce (for re-sharing/boosting)  
  * Like  
  * Delete (soft-deletes local content and federates deletion)  
  * Update  
  * Move (for actor migration)  
  * Undo (for Follow, Like, Announce, Create/Delete, Block)  
  * Flag (triggers moderation workflow)  
* **Security & Basic Functionality:**  
  * **HTTP Signatures (RFC 9421):** Cryptographic signing and verification of server-to-server requests for authenticity and integrity (for demonstration purposes).  
  * **Asynchronous Processing with BullMQ:** Offloads some federation tasks to background workers, improving API responsiveness.  
  * **Rate Limiting:** Basic protection for public endpoints using Redis.  
  * **JWT Authentication:** For local client-to-server (C2S) interactions (e.g., posting to outbox).  
  * **Custom Logging:** Structured and configurable logging with NestJS's LoggerService.  
  * **Global Exception Handling:** Consistent error responses.  
* **Data Persistence:**  
  * **PostgreSQL:** Primary database for storing actors, activities, follows, content objects, likes, and moderation flags using TypeORM.  
  * **Redis:** Used by BullMQ for job queues and also as a direct client for rate limiting and in-memory caching of remote public keys/shared inboxes.

## **🏗️ Architecture: Modular Monolith**

The project adopts a **Modular Monolith** architecture, structuring the application into distinct, loosely coupled modules within a single deployment unit. This provides organizational benefits similar to microservices while maintaining the deployment simplicity of a monolith.

* **Core Modules:**  
  * AppModule: The root module, orchestrating other modules and global configurations.  
  * AuthModule: Handles user registration, login, and JWT token management.  
  * ModerationModule: Manages flagged content and moderation workflows.  
  * RemoteObjectModule: Dedicated to fetching and caching remote ActivityPub objects (e.g., for replies or announced items).  
* **Data Layer:** TypeORM for object-relational mapping with PostgreSQL.  
* **Asynchronous Processing:** BullMQ (backed by Redis) for all background jobs related to ActivityPub federation.  
* **HTTP Signatures:** Implemented within AppService and ActivityProcessor for secure S2S communication.

## **🚀 Getting Started**

### **Prerequisites**

Before you begin, ensure you have the following installed:

* **Node.js** (LTS version recommended)  
* **npm** or **Yarn**  
* **PostgreSQL** (and a database created, e.g., activitypub\_minimal)  
* **Redis**

### **Installation**

1. **Clone the repository:**  
   git clone https://github.com/your-repo/activitypub-nestjs-minimal.git  
   cd activitypub-nestjs-minimal

   *(Note: Replace your-repo with the actual repository URL if this project is hosted.)*  
2. **Install dependencies:**  
   npm install  
   \# or yarn install

### **Configuration (.env file)**

Create a .env file in the root of your project and populate it with the following environment variables. **Replace placeholder values with your actual credentials.**  
\# Application Base URL (important for ActivityPub IDs)  
INSTANCE\_BASE\_URL=http://localhost:3000/api

\# PostgreSQL Database Configuration  
DB\_HOST=localhost  
DB\_PORT=5432  
DB\_USERNAME=postgres  
DB\_PASSWORD=your\_postgres\_password \# \<\<\< CHANGE THIS  
DB\_DATABASE=activitypub\_minimal \# \<\<\< Ensure this database exists

\# Redis Configuration (for BullMQ and Rate Limiting)  
REDIS\_HOST=localhost  
REDIS\_PORT=6379

\# Logging Level (debug, log, warn, error, verbose)  
LOG\_LEVEL=debug

\# JWT Secret for Local Authentication (MUST be strong and random in production)  
\# Generate one: openssl rand \-base64 32  
JWT\_SECRET=yourSuperSecretKeyThatIsAtLeast32CharactersLongAndRandomlyGeneratedForProduction \# \<\<\< CHANGE THIS

\# Default Actor's Private Key (DANGER: For demo ONLY. Use KMS in production\!)  
\# You can generate a new RSA key pair:  
\# openssl genpkey \-algorithm RSA \-out private\_key.pem \-pkeyopt rsa\_keygen\_bits:2048  
\# Then copy the content of private\_key.pem here.  
DEFAULT\_ACTOR\_PRIVATE\_KEY\_PEM="-----BEGIN PRIVATE KEY-----\\nMIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBAK71oYw2k8q6l8nB\\n... (your actual private key content here) ...\\n-----END PRIVATE KEY-----" \# \<\<\< CHANGE THIS OR LEAVE EMPTY TO AUTO-GENERATE (LESS SECURE)

**Security Warning:**

* **DB\_PASSWORD**: Use a strong, unique password for your PostgreSQL user.  
* **JWT\_SECRET**: Generate a truly random and long string for production.  
* **DEFAULT\_ACTOR\_PRIVATE\_KEY\_PEM**: Storing private keys in environment variables or plaintext files is a **severe security vulnerability for production environments**. This is included for ease of demonstration. In a real-world application, integrate with a **Key Management System (KMS)** like AWS KMS, Azure Key Vault, Google Cloud KMS, or HashiCorp Vault.

### **Running the Application**

1. **Start your PostgreSQL and Redis servers.**  
2. **Run the NestJS application in development mode:**  
   npm run start:dev

   The application will automatically synchronize the database schema (due to synchronize: true in app.module.ts \- **disable this in production and use migrations\!**). It will also create a default testuser actor if one doesn't exist.

## **🚀 Deployment with HTTPS (Docker Compose)**

To deploy your application with HTTPS using Nginx and Let's Encrypt, follow these steps. This assumes you have already prepared your docker-compose.yml, nginx/nginx.conf, and nginx/conf.d/yourdomain.com.conf files as discussed in the project documentation.  
Important Note on INSTANCE\_BASE\_URL:  
Ensure that the INSTANCE\_BASE\_URL in your .env file (or as an environment variable in your docker-compose.yml) is set to your publicly accessible HTTPS domain, e.g., https://yourdomain.com/api. This is crucial for ActivityPub IDs and federation.

1. **Install Docker and Docker Compose on your server:**  
   * **For Ubuntu/Debian:**  
     sudo apt update  
     sudo apt install ca-certificates curl gnupg  
     sudo install \-m 0755 \-d /etc/apt/keyrings  
     curl \-fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg \--dearmor \-o /etc/apt/keyrings/docker.gpg  
     sudo chmod a+r /etc/apt/keyrings/docker.gpg  
     echo \\  
       "deb \[arch="$(dpkg \--print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg\] https://download.docker.com/linux/ubuntu \\  
       "$(. /etc/os-release && echo "$VERSION\_CODENAME")" stable" | \\  
       sudo tee /etc/apt/sources.list.d/docker.list \> /dev/null  
     sudo apt update  
     sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin  
     sudo usermod \-aG docker $USER  
     echo "Please log out and log back in, or run 'newgrp docker' for Docker commands to work without sudo."

2. **Navigate to your project root directory on the server:**  
   cd /path/to/your/nestjs-app

3. Build your application's Docker image and start the app and nginx services:  
   This will bring up Nginx listening on port 80 (HTTP) for Certbot's domain validation.  
   docker compose build  
   docker compose up \-d app nginx

4. Request your Let's Encrypt SSL certificate using the certbot service:  
   Replace yourdomain.com and www.yourdomain.com with your actual domain(s), and your\_email@example.com with your contact email.  
   docker compose run \--rm certbot certonly \--webroot \-w /var/www/certbot \-d yourdomain.com \-d www.yourdomain.com \--email your\_email@example.com \--agree-tos \--no-eff-email

   * **Note:** If the above command fails, you might try using the \--nginx authenticator (e.g., docker compose run \--rm certbot certonly \--nginx ...).  
5. Restart the nginx service to apply the new HTTPS configuration:  
   After Certbot successfully obtains the certificate and you have manually updated your nginx/conf.d/yourdomain.com.conf file with the HTTPS block and ActivityPub-specific proxy\_set\_header directives, restart Nginx.  
   docker compose restart nginx

6. **Ensure all services are running, including Certbot's automatic renewal loop:**  
   docker compose up \-d

7. Verify automatic certificate renewal (optional):  
   You can test if Certbot's renewal process is working correctly:  
   docker compose run \--rm certbot renew \--dry-run

## **🔌 Key Endpoints**

All API endpoints are prefixed with /api.

* **Health Check:**  
  * GET /api/health  
* **WebFinger (User Discovery):**  
  * GET /.well-known/webfinger?resource=acct:username@yourdomain.com  
* **NodeInfo (Instance Metadata):**  
  * GET /.well-known/nodeinfo  
  * GET /api/nodeinfo/2.0  
* **Actor Profiles:**  
  * GET /api/actors/:username (e.g., /api/actors/testuser) \- Supports content negotiation for application/activity+json or text/html.  
* **Collections:**  
  * GET /api/actors/:username/followers  
  * GET /api/actors/:username/following  
  * GET /api/actors/:username/outbox (requires JWT for full access, public only otherwise)  
  * GET /api/actors/:username/inbox (requires JWT for full access, public only otherwise)  
  * GET /api/actors/:username/liked  
* **Content Objects:**  
  * GET /api/objects/:id(\*) (e.g., /api/objects/http://localhost:3000/api/actors/testuser/objects/12345)  
* **Public Timeline:**  
  * GET /api/public \- Displays public Note objects from the instance.  
* **ActivityPub Inbox (Server-to-Server):**  
  * POST /api/actors/:username/inbox \- Receives activities from other instances. Requires HTTP Signatures.  
* **ActivityPub Outbox (Client-to-Server/Publishing):**  
  * POST /api/actors/:username/outbox \- Local clients publish activities. Requires JWT authentication.  
* **Relay Inbox (Conceptual):**  
  * POST /api/inbox \- Generic inbox for relay servers. Requires HTTP Signatures.  
* **Authentication:**  
  * POST /api/auth/register \- Register a new local user/actor.  
  * POST /api/auth/login \- Log in a local user and get a JWT.

## **⚠️ Security Considerations & TODOs**

This project is a **toy implementation**, and while it demonstrates core concepts, many aspects require careful attention for anything beyond experimentation:

* **Private Key Management:** **CRITICAL\!** Storing private keys in .env or the database is highly insecure. For anything beyond a toy, integrate with a dedicated **Key Management System (KMS)**.  
* **Database Migrations:** synchronize: true is for development convenience only. For anything beyond a toy, use TypeORM's migration capabilities to manage schema changes safely.  
* **JSON Schema Validation:** Implement comprehensive JSON Schema validation for all incoming ActivityPub payloads to prevent malformed or malicious data.  
* **Distributed Caching:** Replace in-memory caches (for public keys, shared inboxes, remote objects) with a robust, distributed solution like Redis or Memcached for multi-instance scalability and persistence.  
* **Error Handling & Monitoring:** Enhance error logging (e.g., integrate with Loki/Grafana, Sentry) and add more specific error types.  
* **Audience Filtering:** While basic public filtering is in place, more sophisticated audience filtering (e.g., private messages, group messages) would require more complex logic.  
* **Content Moderation Workflow:** The Flag activity is handled, but a full moderation UI/workflow is needed.  
* **Rate Limiting Configuration:** Make rate limit values configurable externally.  
* **HTTPS:** Always deploy with HTTPS in production.  
* **Websocket/SSE:** For real-time updates (e.g., new activities appearing in a timeline), integrate WebSockets or Server-Sent Events (SSE).

## **🤝 Contributing**

Contributions are welcome\! Please feel free to open issues or submit pull requests.

## **📄 License**

This project is open-sourced under the GNU Affero General Public License v3.0 (AGPL-3.0). See the LICENSE file for details.