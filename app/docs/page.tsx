'use client';

import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

export default function DocsPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Open-Audit API Documentation</h1>
      <SwaggerUI url="/api/openapi" />
    </div>
  );
}
