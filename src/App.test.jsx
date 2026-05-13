import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthenticatedApp } from './App';

const mockUseAuth = vi.fn();

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }) => children,
}));

vi.mock('./pages/JarvisTerminal', () => ({
  default: () => <div>Jarvis Terminal Screen</div>,
}));

vi.mock('@/components/UserNotRegisteredError', () => ({
  default: () => <div>User Not Registered Screen</div>,
}));

vi.mock('./lib/PageNotFound', () => ({
  default: () => <div>Page Not Found Screen</div>,
}));

describe('AuthenticatedApp routing guards', () => {
  it('shows loading while auth state is resolving', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoadingAuth: true,
      isLoadingPublicSettings: false,
      authError: null,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthenticatedApp />
      </MemoryRouter>
    );

    expect(screen.getByText('Loading account...')).toBeInTheDocument();
  });

  it('shows not registered error for unregistered users', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoadingAuth: false,
      isLoadingPublicSettings: false,
      authError: { type: 'user_not_registered' },
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthenticatedApp />
      </MemoryRouter>
    );

    expect(screen.getByText('User Not Registered Screen')).toBeInTheDocument();
  });

  it('prevents unauthenticated users from seeing protected content', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoadingAuth: false,
      isLoadingPublicSettings: false,
      authError: null,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthenticatedApp />
      </MemoryRouter>
    );

    expect(screen.getByText('Page Not Found Screen')).toBeInTheDocument();
    expect(screen.queryByText('Jarvis Terminal Screen')).not.toBeInTheDocument();
  });

  it('renders protected content for authenticated users', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoadingAuth: false,
      isLoadingPublicSettings: false,
      authError: null,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthenticatedApp />
      </MemoryRouter>
    );

    expect(screen.getByText('Jarvis Terminal Screen')).toBeInTheDocument();
  });

  it('redirects wildcard routes to root for authenticated users', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoadingAuth: false,
      isLoadingPublicSettings: false,
      authError: null,
    });

    render(
      <MemoryRouter initialEntries={['/unknown']}>
        <AuthenticatedApp />
      </MemoryRouter>
    );

    expect(screen.getByText('Jarvis Terminal Screen')).toBeInTheDocument();
  });
});
