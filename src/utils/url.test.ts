
import { isLocalURL } from './url';

describe('isLocalURL', () => {
  it('should return true for localhost', () => {
    expect(isLocalURL('http://localhost')).toBe(true);
    expect(isLocalURL('http://localhost:3000')).toBe(true);
  });

  it('should return true for 127.0.0.1', () => {
    expect(isLocalURL('http://127.0.0.1')).toBe(true);
  });

  it('should return true for ::1', () => {
    expect(isLocalURL('http://[::1]')).toBe(true);
  });

  it('should return true for LAN addresses', () => {
    expect(isLocalURL('http://10.0.0.1')).toBe(true);
    expect(isLocalURL('http://10.255.255.255')).toBe(true);
    expect(isLocalURL('http://172.16.0.1')).toBe(true);
    expect(isLocalURL('http://172.31.255.255')).toBe(true);
    expect(isLocalURL('http://192.168.1.1')).toBe(true);
  });

  it('should return false for other public IP addresses', () => {
    expect(isLocalURL('http://8.8.8.8')).toBe(false);
    expect(isLocalURL('http://172.15.255.255')).toBe(false);
    expect(isLocalURL('http://172.32.0.0')).toBe(false);
  });

  it('should return true for .local domains', () => {
    expect(isLocalURL('http://myserver.local')).toBe(true);
    expect(isLocalURL('http://test.local:8080')).toBe(true);
  });

  it('should return true for hostnames without dots', () => {
    expect(isLocalURL('http://mycomputer')).toBe(true);
    expect(isLocalURL('http://dev-server:8000')).toBe(true);
  });

  it('should return false for public domains', () => {
    expect(isLocalURL('https://firefox.com')).toBe(false);
    expect(isLocalURL('https://profiler.firefox.com')).toBe(false);
  });

  it('should return false for invalid URLs', () => {
    expect(isLocalURL('not-a-url')).toBe(false);
  });
});
