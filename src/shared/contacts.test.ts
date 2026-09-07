import { z } from "zod";
import { instagramSchema, normalizeInstagram, normalizeWhatsapp, whatsappSchema } from "./contacts";

const schema = z.object({ whatsapp: whatsappSchema, instagram: instagramSchema.optional() });

describe("contacts", () => {
  it("normalizeWhatsapp mantém só dígitos", () => {
    expect(normalizeWhatsapp("+55 (86) 99999-0000")).toBe("5586999990000");
  });

  it("normalizeInstagram remove @ e espaços", () => {
    expect(normalizeInstagram("@Joao.Lucas ")).toBe("Joao.Lucas");
  });

  it("whatsappSchema aceita máscara e devolve dígitos com DDI", () => {
    expect(schema.parse({ whatsapp: "+55 (86) 99999-0000" }).whatsapp).toBe("5586999990000");
    expect(schema.parse({ whatsapp: "55 86 9999 0000" }).whatsapp).toBe("558699990000");
  });

  it("whatsappSchema rejeita número sem DDI no campo whatsapp", () => {
    const result = schema.safeParse({ whatsapp: "(86) 99999-0000" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["whatsapp"]);
  });

  it("instagramSchema normaliza e valida", () => {
    expect(schema.parse({ whatsapp: "5586999990000", instagram: "@Joao.Lucas " }).instagram).toBe("Joao.Lucas");
    expect(schema.safeParse({ whatsapp: "5586999990000", instagram: "joao lucas!" }).success).toBe(false);
    expect(schema.safeParse({ whatsapp: "5586999990000", instagram: "@ " }).success).toBe(false);
  });
});
