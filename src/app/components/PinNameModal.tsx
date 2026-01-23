'use client';

import { useState, useEffect } from 'react';
import { Modal, Input, Form } from 'antd';

interface PinNameModalProps {
  open: boolean;
  onOk: (customName: string) => void;
  onCancel: () => void;
  defaultName: string;
  title?: string;
}

export default function PinNameModal({
  open,
  onOk,
  onCancel,
  defaultName,
  title = 'Pin Message',
}: PinNameModalProps) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({ name: defaultName });
      // Auto-select the text for easy replacement
      setTimeout(() => {
        const input = document.querySelector('input[name="name"]') as HTMLInputElement;
        if (input) {
          input.select();
        }
      }, 100);
    }
  }, [open, defaultName, form]);

  const handleOk = () => {
    form.validateFields().then((values) => {
      onOk(values.name.trim() || defaultName);
      // Don't call form.resetFields() here - Modal's destroyOnHidden will handle cleanup
    });
  };

  const handleCancel = () => {
    // Don't call form.resetFields() here - Modal's destroyOnHidden will handle cleanup
    onCancel();
  };

  return (
    <Modal
      title={title}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="Pin"
      cancelText="Cancel"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          label="Custom Name (Optional)"
          name="name"
          rules={[{ required: false }]}
          extra="Leave as is to use the event name, or enter a custom name"
        >
          <Input
            placeholder="Enter custom name"
            autoFocus
            onPressEnter={handleOk}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
