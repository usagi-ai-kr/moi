import { ConfigProvider, Layout, Typography } from 'antd';

// 0.1.0 홈 스캐폴드 — 로그인 UI는 0.1.1~0.1.3에서 추가 (#2~#4)
export function App() {
  return (
    <ConfigProvider>
      <Layout style={{ minHeight: '100vh' }}>
        <Layout.Content style={{ padding: 24 }}>
          <Typography.Title level={1}>moi</Typography.Title>
          <Typography.Paragraph>AWS SAA 자격증 학습</Typography.Paragraph>
          <Typography.Text type="secondary">
            0.1.0 스캐폴드 — 로그인은 다음 단계에서 추가됩니다.
          </Typography.Text>
        </Layout.Content>
      </Layout>
    </ConfigProvider>
  );
}
