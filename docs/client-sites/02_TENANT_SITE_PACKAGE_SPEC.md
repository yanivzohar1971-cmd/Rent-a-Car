# Tenant Site Package Spec

## What each client gets

### 1. Domain binding
- Existing client domain
- Optional www/non-www policy
- TLS handled by hosting
- Domain -> tenant mapping

### 2. Brand package
- business name
- logo
- primary/secondary colors
- hero image or fallback
- header/footer settings
- phone/WhatsApp/email/address

### 3. Content package
- homepage blocks
- about text
- contact page content
- financing / trade-in / services pages toggle
- trust badges / guarantees / selling points

### 4. Inventory package
- only this tenant's cars
- only this tenant's images
- only this tenant's phone/contact CTA
- only this tenant's branches if multi-branch support exists

### 5. SEO package
- per-domain title templates
- per-domain description templates
- sitemap generation
- robots policy
- canonical policy
- legacy URL preservation/redirect rules

### 6. Lead package
- contact form routing
- WhatsApp click tracking
- phone click tracking
- source attribution by domain/page/vehicle

### 7. Runtime package
- domain resolver
- tenant theme resolver
- tenant route scope
- legacy route resolver

## What the client does NOT get
- separate application codebase
- separate Firebase project
- separate image bucket
- custom one-off architecture

## Minimal config schema

```json
{
  "tenantId": "srk",
  "domains": ["srk-car.com", "www.srk-car.com"],
  "isPrimaryDomain": true,
  "brand": {
    "name": "SRK",
    "logoUrl": "",
    "primaryColor": "",
    "secondaryColor": ""
  },
  "contact": {
    "phone": "03-9613039",
    "whatsapp": "",
    "email": "",
    "address": ""
  },
  "content": {
    "about": "",
    "homepageSections": [],
    "enabledPages": ["inventory", "about", "contact"]
  },
  "seo": {
    "titleTemplate": "",
    "descriptionTemplate": "",
    "robotsMode": "index",
    "legacyMigrationEnabled": true
  },
  "dataScope": {
    "yardId": "",
    "sellerId": "",
    "inventoryFilter": {}
  }
}
```
