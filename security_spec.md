# Security Specification

## 1. Data Invariants
- A **QRCode** cannot be 'utilizado' (used) if its status is not 'ativo' (active) or if it is expired.
- An **Atendimento** must be linked to a valid **QRCode**, **Fornecedor**, and **Associado**.
- Only the **Master Admin** (marcoinfofranca@gmail.com) can change a user's role.
- **Fornecedores** (Barbers) can only validate QR Codes (update status to 'utilizado') and create **Atendimentos**.
- **PII Isolation**: Associados and Fornecedores data (CPF, Phone, Email) should only be accessible to authenticated users.

## 2. Dirty Dozen Payloads

1. **Self-Promotion Attack**: A barber tries to update their own `perfil` to 'admin'.
2. **Shadow Admin Attack**: An admin (not master) tries to update another user's `perfil` to 'admin'.
3. **QR Code Reuse**: A barber tries to update a QR Code with status 'utilizado' to 'ativo'.
4. **Expired QR Bypass**: A barber tries to create an Atendimento using an expired QR Code.
5. **Orphan Atendimento**: Creating an Atendimento with a non-existent Associado ID.
6. **Price Injection**: An admin tries to create a `configuracoes_valor` with a negative value.
7. **Bypassing Master Admin**: A non-master user tries to change the `perfil` field in the `users` collection.
8. **Shadow Field Injection**: Creating an `associado` with an undocumented `isPremium` field.
9. **Identity Spoofing**: Creating an Atendimento where `fornecedor_id` does not match the barber's linked ID.
10. **PII Scraping**: An unauthenticated user tries to list the `associados` collection.
11. **Document ID Poisoning**: Trying to create a user with a document ID that is 2KB long.
12. **Status Skipping**: Updating a QR Code status from 'ativo' directly to 'cancelado' by a non-admin.

## 3. Implementation Plan
- Strengthening `isAdmin()` to strictly enforce Master Admin for RBAC changes.
- Adding `isValidId()` and size checks to all strings.
- Implementing `isValid[Entity]` helpers for each collection.
- Enforcing `affectedKeys().hasOnly()` for updates.
- Protecting PII by ensuring only authorized roles can read sensitive collections.
