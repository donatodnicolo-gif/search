// ============================================================
// CARICAMENTO CONSEGNE CON L'AI (27/08/2026, chiesto dall'utente)
// ------------------------------------------------------------
// «Quando fai nuova consegna metti possibilità di caricarla tramite AI
// digitando un testo veloce da mobile, anche usando un messaggio vocale o
// caricando una immagine. Il form compilato viene a quel punto proposto
// all'utente.»
//
// ⭐⭐ LA REGOLA DI QUESTA ROTTA: **propone, non crea**. Restituisce i campi
// del form e nient'altro — la consegna nasce solo quando una persona preme
// Salva. Qui dentro finiscono indirizzi, nomi e orari di clienti veri: un
// modello che sbaglia una cifra dell'ora o un numero civico deve poter essere
// corretto PRIMA che diventi un giro del valet, non dopo.
//
// ⚠️ **Claude non ascolta l'audio.** Il «messaggio vocale» si trascrive nel
// BROWSER (Web Speech API) e qui arriva come testo: mandare un file audio a
// questa rotta non funzionerebbe, e prometterlo sarebbe peggio che non averlo.
// Le IMMAGINI invece le legge davvero (una foto di un ordine scritto a mano,
// uno screenshot di WhatsApp).
//
// ⚠️ Ogni campo torna con la sua CONFIDENZA e, dove il modello ha tirato a
// indovinare, torna VUOTO. Vale [[feedback-non-dedurre-dati-critici]]: meglio
// un campo da compilare a mano che un indirizzo inventato che sembra giusto.
// ============================================================
import Anthropic from '@anthropic-ai/sdk';
import {
  BadRequestException,
  Body,
  Controller,
  Injectable,
  Module,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsModule, SettingsService } from '../settings/settings.module';

/** Il modello: quello buono. La scelta di risparmiare la fa l'utente, non noi. */
const MODELLO = 'claude-opus-5';
/**
 * MOTORE OPENAI (04/09/2026, chiesto dall'utente: «implementa openai»).
 * Stesse istruzioni, stesso schema, stessa regola «propone, non crea»: cambia
 * solo chi legge. Si parla con l'API Responses via fetch, senza SDK: una
 * dipendenza in meno da compilare a ogni deploy (regola «Deploy e costi»).
 */
const MODELLO_OPENAI = 'gpt-5';
const OPENAI_URL = 'https://api.openai.com/v1/responses';

/** Un'immagine oltre questo peso non entra in una richiesta: si dice, non si tronca. */
const MAX_IMMAGINE_BYTE = 4 * 1024 * 1024;

export class LeggiConsegnaDto {
  /** Il testo dettato o scritto. Facoltativo se c'è l'immagine. */
  @IsOptional() @IsString() @MaxLength(8000) testo?: string;
  /** L'immagine in base64 (senza il prefisso data:), facoltativa. */
  @IsOptional() @IsString() immagine?: string;
  @IsOptional() @IsIn(['image/jpeg', 'image/png', 'image/webp', 'image/gif']) tipoImmagine?: string;
}

/**
 * Lo SCHEMA della risposta: il modello non scrive prosa, riempie questi campi.
 * ⚠️ Ogni campo può essere `null`: e' il modo in cui il modello dice «non c'e'
 * scritto», e va lasciato vuoto nel form invece che riempito a caso.
 */
/**
 * «Testo, oppure niente».
 * ⚠️ Si usa `anyOf`, NON `type: ['string','null']`: il sottoinsieme di JSON
 * Schema accettato dalle uscite strutturate documenta `anyOf` e i tipi base,
 * non l'unione scritta come elenco di tipi. Con la forma non documentata il
 * rischio non è un campo sbagliato, è un 400 al primo uso vero.
 */
const testoOppureNiente = (descrizione?: string) => ({
  anyOf: [{ type: 'string' as const }, { type: 'null' as const }],
  ...(descrizione ? { description: descrizione } : {}),
});
const numeroOppureNiente = (descrizione?: string) => ({
  anyOf: [{ type: 'number' as const }, { type: 'null' as const }],
  ...(descrizione ? { description: descrizione } : {}),
});

const SCHEMA_CONSEGNA = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    data: testoOppureNiente('AAAA-MM-GG, solo se scritta o deducibile senza dubbio (es. «domani»)'),
    consegnaDalle: testoOppureNiente('HH:MM'),
    consegnaAlle: testoOppureNiente('HH:MM'),
    ritiroDalle: testoOppureNiente('HH:MM'),
    ritiroAlle: testoOppureNiente('HH:MM'),
    destinatarioNome: testoOppureNiente(),
    destinatarioCognome: testoOppureNiente(),
    destinatarioIndirizzo: testoOppureNiente('Indirizzo completo come scritto'),
    destinatarioCitofono: testoOppureNiente(),
    destinatarioTelefono: testoOppureNiente(),
    mittenteNome: testoOppureNiente(),
    mittenteCognome: testoOppureNiente(),
    indirizzoRitiro: testoOppureNiente(),
    prodotto: testoOppureNiente('Che cosa va consegnato, come lo dice il testo'),
    quantita: numeroOppureNiente(),
    contrassegno: numeroOppureNiente('Contanti da incassare alla consegna, in euro'),
    note: testoOppureNiente(),
    confidenza: { type: 'string', enum: ['alta', 'media', 'bassa'] },
    /** Che cosa NON c'era: si dichiara, non si indovina. */
    campiMancanti: { type: 'array', items: { type: 'string' } },
    /** In italiano, per chi legge la proposta: perché ha capito così. */
    perche: { type: 'string' },
  },
  required: ['confidenza', 'campiMancanti', 'perche'],
};

const ISTRUZIONI = [
  'Sei un impiegato della logistica di Deluxy, consegne di lusso in guanti bianchi.',
  'Leggi il messaggio (testo dettato, appunti, screenshot di WhatsApp o foto di un ordine scritto) e compila i campi di una nuova consegna.',
  '',
  'REGOLE, in ordine di importanza:',
  '1. NON INVENTARE. Se un dato non c\'è, lascia il campo null e mettilo in campiMancanti. Un indirizzo inventato che sembra giusto è il danno peggiore che puoi fare: qualcuno ci manda un valet.',
  '2. Gli orari in HH:MM su 24 ore. «nel pomeriggio» NON è un orario: lascia null.',
  '3. La data in AAAA-MM-GG. Traduci «oggi» e «domani» solo se ti è stata data la data di oggi; altrimenti null.',
  '4. L\'indirizzo va riportato COME È SCRITTO, senza completarlo con quello che immagini (niente CAP o città aggiunti di tua iniziativa).',
  '5. Il contrassegno è denaro: mettilo solo se il testo dice chiaramente che il valet deve incassare.',
  '6. In «perche» spiega in una frase in italiano che cosa hai capito, così chi legge può smentirti in un colpo d\'occhio.',
].join('\n');

@Injectable()
export class AiService {
  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Legge un testo (o un'immagine) e PROPONE i campi di una consegna.
   * Non scrive niente in banca dati: il ritorno è una proposta.
   */
  async leggiConsegna(dto: LeggiConsegnaDto) {
    const testo = (dto.testo ?? '').trim();
    if (!testo && !dto.immagine) {
      throw new BadRequestException('Serve un testo o un\'immagine da leggere.');
    }
    if (dto.immagine) {
      // base64 → byte: 3 byte ogni 4 caratteri.
      const byte = Math.ceil((dto.immagine.length * 3) / 4);
      if (byte > MAX_IMMAGINE_BYTE) {
        throw new BadRequestException(
          `L'immagine pesa ${(byte / 1024 / 1024).toFixed(1)} MB: il massimo è 4 MB. Riprova con una foto più leggera.`,
        );
      }
    }

    const { motore, chiave } = await this.settings.motoreAi();
    if (!chiave) {
      // ⚠️ Non si torna indietro in silenzio: chi preme il bottone deve sapere
      // che manca una chiave, non pensare che la funzione sia rotta.
      throw new ServiceUnavailableException(
        motore === 'openai'
          ? 'La chiave OpenAI non è impostata: si incolla in Impostazioni → Intelligenza artificiale.'
          : 'La chiave dell\'AI non è impostata: si incolla in Impostazioni → aiApiKey.',
      );
    }

    // La data di OGGI, ora di Roma: senza, «domani» non è traducibile e il
    // modello ha l'ordine di lasciare la data vuota.
    const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());

    if (motore === 'openai') return this.leggiConOpenai(dto, testo, oggi, chiave);

    const contenuto: Anthropic.ContentBlockParam[] = [];
    if (dto.immagine) {
      contenuto.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: (dto.tipoImmagine ?? 'image/jpeg') as 'image/jpeg',
          data: dto.immagine,
        },
      });
    }
    contenuto.push({
      type: 'text',
      text: `Oggi è ${oggi} (fuso Europe/Rome).\n\nMessaggio da leggere:\n${testo || '(nessun testo: leggi l\'immagine)'}`,
    });

    const claude = new Anthropic({ apiKey: chiave });
    let risposta: Anthropic.Message;
    try {
      risposta = await claude.messages.create({
        model: MODELLO,
        max_tokens: 4000,
        system: ISTRUZIONI,
        messages: [{ role: 'user', content: contenuto }],
        // `output_config.format` e' un parametro STABILE dell'SDK 0.121
        // (`MessageCreateParams.output_config`): niente cast, cosi' se un
        // domani cambia forma il typecheck se ne accorge invece di tacere.
        output_config: { format: { type: 'json_schema', schema: SCHEMA_CONSEGNA } },
      });
    } catch (e) {
      // L'errore vero, non un «riprova»: chi lo legge deve poterlo risolvere.
      throw new ServiceUnavailableException(
        `L'AI non ha risposto: ${(e as Error).message.slice(0, 200)}`,
      );
    }

    // ⚠️ Due modi in cui la risposta NON rispetta lo schema pur essendo una
    // risposta valida: il rifiuto e il taglio a max_tokens. Senza questi due
    // controlli si arriverebbe a un JSON.parse fallito e si direbbe «formato
    // inatteso» — vero ma inutile a chi deve capire che cosa fare.
    if (risposta.stop_reason === 'refusal') {
      throw new ServiceUnavailableException(
        'L\'AI si è rifiutata di leggere questo messaggio. Compila il modulo a mano.',
      );
    }
    if (risposta.stop_reason === 'max_tokens') {
      throw new ServiceUnavailableException(
        'Il messaggio è troppo lungo: la risposta si è interrotta a metà. Prova a spezzarlo.',
      );
    }

    const blocco = risposta.content.find((b) => b.type === 'text');
    if (!blocco || blocco.type !== 'text') {
      throw new ServiceUnavailableException('L\'AI ha risposto in un formato inatteso.');
    }
    let proposta: Record<string, unknown>;
    try {
      proposta = JSON.parse(blocco.text);
    } catch {
      throw new ServiceUnavailableException('L\'AI ha risposto qualcosa che non è il modulo atteso.');
    }

    return {
      // ⚠️ Si chiama PROPOSTA di proposito, in ogni strato: nessuno deve poter
      // scambiarla per una consegna creata.
      proposta,
      modello: MODELLO,
      // Che cosa e' costato, per chi vuole tenerne il conto.
      token: {
        letti: risposta.usage?.input_tokens ?? null,
        scritti: risposta.usage?.output_tokens ?? null,
      },
    };
  }

  /**
   * La stessa lettura con ChatGPT (API Responses, uscita strutturata).
   * ⚠️ In modalita' `strict` OpenAI vuole OGNI proprieta' in `required` e
   * `additionalProperties:false` su ogni oggetto: lo schema di Claude ha solo
   * tre campi obbligatori, quindi qui si deriva una copia con tutti i campi
   * richiesti (il «non c'e'» resta `null`, come per Claude).
   */
  private async leggiConOpenai(dto: LeggiConsegnaDto, testo: string, oggi: string, chiave: string) {
    const schemaStretto = {
      ...SCHEMA_CONSEGNA,
      required: Object.keys(SCHEMA_CONSEGNA.properties),
    };
    const contenuto: Array<Record<string, unknown>> = [];
    if (dto.immagine) {
      contenuto.push({
        type: 'input_image',
        image_url: `data:${dto.tipoImmagine ?? 'image/jpeg'};base64,${dto.immagine}`,
        detail: 'high',
      });
    }
    contenuto.push({
      type: 'input_text',
      text: `Oggi è ${oggi} (fuso Europe/Rome).\n\nMessaggio da leggere:\n${testo || '(nessun testo: leggi l\'immagine)'}`,
    });

    let corpo: {
      status?: string;
      incomplete_details?: { reason?: string };
      output?: Array<{ type: string; content?: Array<{ type: string; text?: string; refusal?: string }> }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      error?: { message?: string };
    };
    try {
      const r = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chiave}` },
        body: JSON.stringify({
          model: MODELLO_OPENAI,
          instructions: ISTRUZIONI,
          input: [{ role: 'user', content: contenuto }],
          // gpt-5 ragiona prima di scrivere e i token del ragionamento contano nel
          // limite: per un'estrazione basta poco ragionamento e un tetto piu' alto.
          reasoning: { effort: 'low' },
          max_output_tokens: 8000,
          text: {
            format: { type: 'json_schema', name: 'consegna', strict: true, schema: schemaStretto },
          },
        }),
        signal: AbortSignal.timeout(90_000),
      });
      corpo = (await r.json()) as typeof corpo;
      if (!r.ok) {
        throw new Error(corpo?.error?.message || `HTTP ${r.status}`);
      }
    } catch (e) {
      // L'errore vero, non un «riprova»: chi lo legge deve poterlo risolvere.
      throw new ServiceUnavailableException(
        `L'AI (OpenAI) non ha risposto: ${(e as Error).message.slice(0, 200)}`,
      );
    }

    if (corpo.status === 'incomplete' && corpo.incomplete_details?.reason === 'max_output_tokens') {
      throw new ServiceUnavailableException(
        'Il messaggio è troppo lungo: la risposta si è interrotta a metà. Prova a spezzarlo.',
      );
    }
    const messaggio = corpo.output?.find((o) => o.type === 'message');
    const parte = messaggio?.content?.[0];
    if (parte?.type === 'refusal') {
      throw new ServiceUnavailableException(
        'L\'AI si è rifiutata di leggere questo messaggio. Compila il modulo a mano.',
      );
    }
    if (!parte || parte.type !== 'output_text' || !parte.text) {
      throw new ServiceUnavailableException('L\'AI ha risposto in un formato inatteso.');
    }
    let proposta: Record<string, unknown>;
    try {
      proposta = JSON.parse(parte.text);
    } catch {
      throw new ServiceUnavailableException('L\'AI ha risposto qualcosa che non è il modulo atteso.');
    }
    return {
      proposta,
      modello: MODELLO_OPENAI,
      token: {
        letti: corpo.usage?.input_tokens ?? null,
        scritti: corpo.usage?.output_tokens ?? null,
      },
    };
  }
}

@ApiTags('ai')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
@Controller('ai')
export class AiController {
  constructor(private readonly service: AiService) {}

  @Post('consegna-da-testo')
  @ApiOperation({
    summary:
      'Legge un testo (dettato o scritto) o un\'immagine e PROPONE i campi di una nuova consegna. Non crea niente.',
  })
  leggiConsegna(@Body() dto: LeggiConsegnaDto) {
    return this.service.leggiConsegna(dto);
  }
}

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
