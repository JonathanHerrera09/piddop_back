const swaggerUi = require('swagger-ui-express');

const specification = {
  openapi: '3.0.3',
  info: {
    title: 'Allorajd API',
    version: '1.0.0',
    description: 'Orders and services platform API.'
  },
  servers: [{ url: '/api/v1', description: 'Current server' }],
  paths: {
    '/health': {
      get: {
        summary: 'Check API and database health',
        responses: {
          200: { description: 'API and database are available' },
          503: { description: 'Database is unavailable' }
        }
      }
    },
    '/auth/register': { post: { summary: 'Register a customer account', responses: { 201: { description: 'Customer created' }, 409: { description: 'Duplicate email or phone' }, 422: { description: 'Invalid request' } } } },
    '/auth/login': { post: { summary: 'Log in any active user role', responses: { 200: { description: 'Tokens issued' }, 401: { description: 'Invalid credentials' }, 403: { description: 'Inactive user' } } } },
    '/auth/refresh': { post: { summary: 'Rotate a refresh token', responses: { 200: { description: 'New tokens issued' }, 401: { description: 'Invalid refresh token' } } } },
    '/auth/logout': { post: { summary: 'Revoke a refresh token', responses: { 200: { description: 'Logout completed' } } } },
    '/auth/forgot-password': { post: { summary: 'Request a password reset', responses: { 200: { description: 'Reset request accepted' } } } },
    '/auth/reset-password': { post: { summary: 'Reset a password with a valid token', responses: { 200: { description: 'Password updated' }, 422: { description: 'Invalid reset token' } } } },
    '/auth/me': { get: { summary: 'Get current authenticated user', responses: { 200: { description: 'User profile' }, 401: { description: 'Authentication required' } } } },
    '/users/me': { get: { summary: 'Get own user profile', responses: { 200: { description: 'User profile' } } }, put: { summary: 'Update own profile', responses: { 200: { description: 'User updated' }, 422: { description: 'Invalid request' } } }, delete: { summary: 'Deactivate own customer account and revoke sessions while retaining order history', responses: { 200: { description: 'Account deactivated' }, 401: { description: 'Authentication required' }, 403: { description: 'Customer account required' } } } },
    '/users/me/photo': { post: { summary: 'Upload own profile photo (image form field)', responses: { 200: { description: 'Photo uploaded' }, 422: { description: 'Invalid image' } } }, delete: { summary: 'Delete own profile photo', responses: { 200: { description: 'Photo deleted' } } } },
    '/admin/roles': { get: { summary: 'List roles and permissions', responses: { 200: { description: 'Roles list' }, 403: { description: 'Super Admin required' } } }, post: { summary: 'Create a role with permissions', responses: { 201: { description: 'Role created' }, 409: { description: 'Duplicate role' }, 422: { description: 'Invalid request' } } } },
    '/admin/permissions': { get: { summary: 'List available permissions', responses: { 200: { description: 'Permissions list' }, 403: { description: 'Super Admin required' } } } }
    ,'/admin/companies': { get: { summary: 'List all companies (Super Admin)', responses: { 200: { description: 'Companies list' }, 403: { description: 'Super Admin required' } } }, post: { summary: 'Create a company (Super Admin)', responses: { 201: { description: 'Company created' }, 422: { description: 'Invalid company type' } } } }
    ,'/admin/companies/{id}': { get: { summary: 'Get a company (Super Admin)', responses: { 200: { description: 'Company' }, 404: { description: 'Not found' } } }, put: { summary: 'Update a company without changing its type', responses: { 200: { description: 'Company updated' }, 409: { description: 'Type cannot change' } } }, delete: { summary: 'Delete an empty company', responses: { 204: { description: 'Company deleted' }, 409: { description: 'Company has related records' } } } }
    ,'/admin/companies/{id}/team': { post: { summary: 'Create a company employee and assign company roles', responses: { 201: { description: 'Employee created' }, 422: { description: 'Invalid company roles' } } } }
    ,'/company/team': { get: { summary: 'List own company team; requires X-Company-Id', responses: { 200: { description: 'Team' }, 403: { description: 'Company permission required' } } }, post: { summary: 'Create a team member in own company', responses: { 201: { description: 'Employee created' } } } }
    ,'/categories': { get: { summary: 'List active categories', responses: { 200: { description: 'Categories' } } } }
    ,'/products': { get: { summary: 'List active products', responses: { 200: { description: 'Products' } } } }
    ,'/admin/categories': { post: { summary: 'Create a category (Super Admin)', responses: { 201: { description: 'Category created' }, 422: { description: 'Invalid category' } } } }
    ,'/company/variants': { get: { summary: 'List own company variants', responses: { 200: { description: 'Variants' } } }, post: { summary: 'Create a variant and options', responses: { 201: { description: 'Variant created' } } } }
    ,'/company/products': { get: { summary: 'List own company products', responses: { 200: { description: 'Products' } } }, post: { summary: 'Create an inactive product', responses: { 201: { description: 'Product created' }, 422: { description: 'Invalid category or product' } } } }
    ,'/company/products/{id}/images': { post: { summary: 'Upload 1 to 5 product images; product maximum is 5', responses: { 201: { description: 'Images uploaded' }, 422: { description: 'Invalid images' } } } }
    ,'/company/products/{id}/ingredients': { get: { summary: 'List own product ingredients', responses: { 200: { description: 'Ingredients' } } }, post: { summary: 'Create a product ingredient and define if it can be removed', responses: { 201: { description: 'Ingredient created' }, 422: { description: 'Invalid ingredient' } } } }
    ,'/company/products/{id}/ingredients/{ingredientId}': { put: { summary: 'Update a product ingredient', responses: { 200: { description: 'Ingredient updated' } } }, delete: { summary: 'Delete a product ingredient', responses: { 204: { description: 'Ingredient deleted' } } } }
    ,'/customer/addresses': { get: { summary: 'List own customer addresses', responses: { 200: { description: 'Addresses' }, 403: { description: 'Customer role required' } } }, post: { summary: 'Create an address, maximum three active addresses', responses: { 201: { description: 'Address created' }, 422: { description: 'Address limit or invalid input' } } } }
    ,'/customer/addresses/{id}': { get: { summary: 'Get own address', responses: { 200: { description: 'Address' }, 404: { description: 'Not found' } } }, put: { summary: 'Update own address', responses: { 200: { description: 'Address updated' } } }, delete: { summary: 'Delete or archive own address', responses: { 204: { description: 'Address deleted' } } } }
    ,'/cart': { get: { summary: 'Get own cart and server-calculated subtotal', responses: { 200: { description: 'Cart' } } }, delete: { summary: 'Clear own cart', responses: { 204: { description: 'Cart cleared' } } } }
    ,'/cart/items': { post: { summary: 'Add an active product to own cart, including variants and removable ingredients', responses: { 201: { description: 'Item added' }, 409: { description: 'Product belongs to another company' }, 422: { description: 'Invalid variants, ingredients, or quantity' } } } }
    ,'/orders': { post: { summary: 'Create an order from own cart', responses: { 201: { description: 'Order created' }, 422: { description: 'Empty cart, invalid address, or unavailable product' } } }, get: { summary: 'List own orders', responses: { 200: { description: 'Orders' } } } }
    ,'/orders/{id}': { get: { summary: 'Get own order and status history', responses: { 200: { description: 'Order' }, 404: { description: 'Not found' } } } }
    ,'/orders/{id}/cancel': { post: { summary: 'Cancel own pending order', responses: { 200: { description: 'Order cancelled' }, 409: { description: 'Order is no longer pending' } } } }
    ,'/orders/{id}/tracking': { get: { summary: 'Get own order tracking', responses: { 200: { description: 'Tracking' } } } }
    ,'/company/orders': { get: { summary: 'List own company orders; requires X-Company-Id', responses: { 200: { description: 'Orders' }, 403: { description: 'Company permission required' } } } }
    ,'/company/orders/{id}/accept': { post: { summary: 'Accept a pending order', responses: { 200: { description: 'Order accepted' }, 409: { description: 'Invalid transition' } } } }
    ,'/company/orders/{id}/reject': { post: { summary: 'Reject a pending order with reason', responses: { 200: { description: 'Order rejected' }, 422: { description: 'Reason required' } } } }
    ,'/company/orders/{id}/preparing': { post: { summary: 'Mark accepted order as preparing', responses: { 200: { description: 'Order preparing' }, 403: { description: 'Role is not allowed' } } } }
    ,'/company/orders/{id}/waiting-delivery': { post: { summary: 'Mark prepared order ready for delivery', responses: { 200: { description: 'Order ready for delivery' } } } }
    ,'/admin/delivery-drivers': { post: { summary: 'Create a delivery driver account (Super Admin)', responses: { 201: { description: 'Driver created' }, 409: { description: 'Duplicate email or phone' } } } }
    ,'/delivery/availability': { put: { summary: 'Set own driver availability to offline or available', responses: { 200: { description: 'Availability updated' }, 409: { description: 'Driver has active delivery' } } } }
    ,'/delivery/orders/available': { get: { summary: 'List orders ready for delivery', responses: { 200: { description: 'Available orders' }, 409: { description: 'Driver is not available' } } } }
    ,'/delivery/orders/{id}/accept': { post: { summary: 'Atomically accept an available order', responses: { 200: { description: 'Order accepted' }, 409: { description: 'Driver busy or order assigned' } } } }
    ,'/delivery/current-order': { get: { summary: 'Get own active delivery', responses: { 200: { description: 'Current delivery or null' } } } }
    ,'/delivery/orders/{id}/on-the-way': { post: { summary: 'Start an accepted delivery', responses: { 200: { description: 'Delivery in transit' } } } }
    ,'/delivery/orders/{id}/complete': { post: { summary: 'Complete delivery with customer code', responses: { 200: { description: 'Delivery completed' }, 422: { description: 'Invalid delivery code' } } } }
    ,'/delivery/location': { post: { summary: 'Update own driver location', responses: { 200: { description: 'Location updated' } } } }
    ,'/delivery/reports': { get: { summary: 'Get own delivery earnings report', responses: { 200: { description: 'Report' } } } }
    ,'/admin/coupons': { get: { summary: 'List coupons (Super Admin)', responses: { 200: { description: 'Coupons' } } }, post: { summary: 'Create a coupon (Super Admin)', responses: { 201: { description: 'Coupon created' }, 409: { description: 'Duplicate code' }, 422: { description: 'Invalid coupon' } } } }
    ,'/coupons/validate': { post: { summary: 'Validate a coupon against own cart', responses: { 200: { description: 'Calculated discount' }, 422: { description: 'Coupon does not apply' } } } }
    ,'/cart/coupon': { post: { summary: 'Apply a validated coupon to own cart', responses: { 200: { description: 'Coupon applied' }, 422: { description: 'Coupon does not apply' } } }, delete: { summary: 'Remove coupon from own cart', responses: { 200: { description: 'Coupon removed' } } } }
    ,'/admin/deliveries/{id}/driver-payment': { put: { summary: 'Set internal payment for a driver, independent of customer delivery fee', responses: { 200: { description: 'Driver payment updated' }, 409: { description: 'Delivered payment cannot be changed' } } } }
    ,'/admin/deliveries': { get: { summary: 'List deliveries and internal driver payments (Super Admin)', responses: { 200: { description: 'Deliveries' } } } }
    ,'/notifications': { get: { summary: 'List notifications for the authenticated user', responses: { 200: { description: 'Notifications' }, 401: { description: 'Authentication required' } } } }
    ,'/notifications/{id}/read': { post: { summary: 'Mark one own notification as read', responses: { 200: { description: 'Notification updated' }, 404: { description: 'Not found' } } } }
    ,'/notifications/read-all': { post: { summary: 'Mark all own notifications as read', responses: { 200: { description: 'Notifications updated' } } } }
    ,'/company/dashboard': { get: { summary: 'Get own company sales, orders, commissions, and recent orders', responses: { 200: { description: 'Company dashboard' }, 403: { description: 'Company dashboard permission required' } } } }
    ,'/admin/dashboard': { get: { summary: 'Get platform company, order, and commission metrics', responses: { 200: { description: 'Admin dashboard' }, 403: { description: 'Super Admin required' } } } }
  }
};

function configureSwagger(app) {
  app.get('/api/docs.json', (req, res) => res.json(specification));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specification, { explorer: true }));
}

module.exports = { configureSwagger };
