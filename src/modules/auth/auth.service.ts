import bcrypt from "bcryptjs";
import type Redis from "ioredis";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../shared/errors/AppError";
import type { UsersRepository } from "../users/users.repository";
import { toPublicUser, type PublicUser, type UserRecord } from "../users/users.types";
import type { LoginInput, RegisterInput } from "./auth.schemas";
import type { TokenService } from "./token.service";

export type RefreshStore = Pick<Redis, "get" | "set" | "del">;

export type AuthResult = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

const BCRYPT_COST = 10;

function refreshKey(jti: string) {
  return `refresh:${jti}`;
}

export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly tokens: TokenService,
    private readonly store: RefreshStore,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw new ConflictError("Email já cadastrado");

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const user = await this.users.create({ name: input.name, email: input.email, passwordHash });
    return this.issueTokens(user);
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);
    const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
    if (!user || !valid) throw new UnauthorizedError("Email ou senha inválidos");
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const { sub, jti } = this.tokens.verifyRefresh(refreshToken);
    const key = refreshKey(jti);

    const owner = await this.store.get(key);
    if (owner !== sub) throw new UnauthorizedError("Sessão inválida");
    await this.store.del(key);

    const user = await this.users.findById(sub);
    if (!user) throw new UnauthorizedError("Sessão inválida");
    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    let jti: string;
    try {
      jti = this.tokens.verifyRefresh(refreshToken).jti;
    } catch {
      return;
    }
    await this.store.del(refreshKey(jti));
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError("Usuário não encontrado");
    return toPublicUser(user);
  }

  private async issueTokens(user: UserRecord): Promise<AuthResult> {
    const accessToken = this.tokens.signAccess({ sub: user.id, role: user.role });
    const refresh = this.tokens.signRefresh(user.id);
    await this.store.set(refreshKey(refresh.jti), user.id, "EX", refresh.ttlSeconds);
    return { user: toPublicUser(user), accessToken, refreshToken: refresh.token };
  }
}
