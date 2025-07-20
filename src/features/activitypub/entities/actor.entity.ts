import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('actors') // Defines this class as a TypeORM entity mapped to the 'actors' table in the database
export class ActorEntity {
  @PrimaryGeneratedColumn('uuid') // Primary key, automatically generated as a UUID
  id: string;

  @Column({ unique: true }) // Column for the ActivityPub URI, must be unique across all actors
  @Index({ unique: true }) // Creates a unique database index on this column for fast lookups
  activityPubId: string; // The full ActivityPub URI for the actor (e.g., http://localhost:3000/actors/testuser)

  @Column({ unique: true }) // Column for the preferred username, must be unique
  @Index({ unique: true }) // Creates a unique database index on this column
  preferredUsername: string; // The username (e.g., 'testuser')

  @Column() // Column for the actor's display name
  name: string;

  @Column({ type: 'jsonb' }) // JSONB column to store the flexible ActivityPub JSON-LD payload of the actor
  // This allows storing various ActivityPub properties like inbox, outbox, publicKey, summary, etc.,
  // without needing to define a fixed schema for every possible field.
  data: any;

  @Column({ type: 'text' }) // Column to store the PEM-encoded public key of the actor
  publicKeyPem: string;

  /**
   * IMPORTANT SECURITY WARNING:
   * In a real production application, private keys should NEVER be stored directly in the database,
   * in environment variables, or in plain text files. This is a severe security vulnerability
   * as compromise of the database or environment variables would expose all private keys,
   * allowing an attacker to impersonate actors and sign malicious activities.
   *
   * Instead, use a dedicated Key Management System (KMS) like AWS KMS, Azure Key Vault,
   * Google Cloud KMS, HashiCorp Vault, or similar Hardware Security Modules (HSMs).
   * The private key should be generated securely within the KMS and only accessed by the application
   * at runtime via the KMS API, with strict access controls, audit logging, and rotation policies.
   *
   * For this self-contained demonstration, it's included for functional completeness,
   * but this approach is NOT suitable for production environments.
   *
   * TODO: Implement KMS integration for private key management in a production environment.
   */
  @Column({ type: 'text' }) // Column to store the PEM-encoded private key
  privateKeyPem: string; 

  // Added for local user authentication (for actors that can log in to this instance)
  @Column({ type: 'text', nullable: true }) // Stores the hashed password for local users
  passwordHash: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date; // Timestamp for when the actor record was created

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date; // Timestamp for the last update to the actor record
}