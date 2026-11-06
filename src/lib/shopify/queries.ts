// Admin GraphQL 2026-10 — gerçek mağazada test edildi.

export const ORDER_FIELDS = /* GraphQL */ `
  fragment OrderFields on Order {
    id
    name
    number
    createdAt
    updatedAt
    cancelledAt
    test
    displayFinancialStatus
    displayFulfillmentStatus
    totalPriceSet { shopMoney { amount currencyCode } }
    subtotalLineItemsQuantity
    email
    phone
    note
    tags
    discountCodes
    customer { id displayName numberOfOrders }
    shippingAddress { name address1 address2 city province zip country phone }
    shippingLine { title }
    lineItems(first: 50) {
      nodes {
        title
        variantTitle
        quantity
        sku
        originalUnitPriceSet { shopMoney { amount } }
        image { url(transform: { maxWidth: 600 }) }
        variant {
          id
          inventoryQuantity
          media(first: 1) { nodes { preview { image { url(transform: { maxWidth: 800 }) } } } }
        }
        product {
          id
          media(first: 6, query: "media_type:IMAGE") { nodes { preview { image { url(transform: { maxWidth: 800 }) } } } }
        }
      }
    }
    fulfillments(first: 10) { createdAt status trackingInfo { company number url } }
  }
`;

export const ORDERS_QUERY = /* GraphQL */ `
  ${ORDER_FIELDS}
  query Orders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes { ...OrderFields }
    }
  }
`;

export const ORDER_QUERY = /* GraphQL */ `
  ${ORDER_FIELDS}
  query Order($id: ID!) {
    order(id: $id) { ...OrderFields }
  }
`;

export const FULFILLMENT_ORDERS_QUERY = /* GraphQL */ `
  query FulfillmentOrders($id: ID!) {
    order(id: $id) {
      fulfillmentOrders(first: 10) {
        nodes { id status requestStatus }
      }
    }
  }
`;

export const FULFILLMENT_CREATE = /* GraphQL */ `
  mutation FulfillmentCreate($fulfillment: FulfillmentInput!) {
    fulfillmentCreate(fulfillment: $fulfillment) {
      fulfillment { id status }
      userErrors { field message }
    }
  }
`;

export const WEBHOOKS_QUERY = /* GraphQL */ `
  query Webhooks {
    webhookSubscriptions(first: 50) {
      nodes { id topic uri }
    }
  }
`;

export const WEBHOOK_CREATE = /* GraphQL */ `
  mutation WebhookCreate($topic: WebhookSubscriptionTopic!, $uri: String!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: { uri: $uri, format: JSON }) {
      webhookSubscription { id topic }
      userErrors { field message }
    }
  }
`;

export const WEBHOOK_DELETE = /* GraphQL */ `
  mutation WebhookDelete($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      deletedWebhookSubscriptionId
      userErrors { field message }
    }
  }
`;

export const INVENTORY_QUERY = /* GraphQL */ `
  query Inventory($after: String) {
    products(first: 50, after: $after, query: "status:active", sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        totalInventory
        onlineStoreUrl
        media(first: 8, query: "media_type:IMAGE") { nodes { preview { image { url(transform: { maxWidth: 800 }) } } } }
        variants(first: 30) {
          nodes {
            id
            title
            inventoryQuantity
            inventoryItem {
              id
              tracked
              inventoryLevels(first: 1) {
                nodes { location { id } quantities(names: ["available"]) { quantity } }
              }
            }
          }
        }
      }
    }
  }
`;

export const ORDER_NOTE_UPDATE = /* GraphQL */ `
  mutation OrderNote($input: OrderInput!) {
    orderUpdate(input: $input) {
      order { id }
      userErrors { field message }
    }
  }
`;

export const INVENTORY_SET = /* GraphQL */ `
  mutation InventorySet($input: InventorySetQuantitiesInput!, $key: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $key) {
      inventoryAdjustmentGroup { id }
      userErrors { code field message }
    }
  }
`;
