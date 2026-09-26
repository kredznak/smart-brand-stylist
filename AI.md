# How Smart Brand Stylist uses AI

**Last updated: 26 September 2026**

Two features in this add-on use generative AI, and everything else does not. This page says which is which, what is sent, what is not, and what we do to keep the results honest. If you only read one line: the AI writes suggestions, you decide what to publish.

## Where AI is used

**Copy suggestions.** The brand name, short description and tone of voice you type are sent to Claude, a language model made by Anthropic, which writes five short options — a tagline, a headline, a call to action or a social caption. You choose whether to use any of them.

**Matching fonts to your logo.** If you press "Match fonts to my logo (AI)", your logo image is sent to Claude along with the add-on's own list of font pairings, and it picks the pairing that suits the logo. It chooses from that list; it cannot invent a font or return anything else.

The model is Claude Haiku 4.5. Requests go to a small server we run, which holds the API key and passes the request to Anthropic. No AI model runs inside the add-on, and no model is bundled with it.

## Where AI is not used

- **Reading colors from your logo** happens entirely in your browser, by looking at the pixels. The image is not uploaded and no AI is involved.
- **Reading a website** fetches that page's stylesheets and reports the colors and font names it finds. The page is never sent to Anthropic and no AI is involved.
- **The colour and font audit** compares what is on your page against your brand kit using plain arithmetic. No AI is involved.

If you never press the two AI buttons, nothing you do in this add-on reaches an AI model.

## What we do not do with what you give us

- Nothing you type or upload is stored on our server. Requests are passed through and the reply is returned.
- Nothing you provide is used to train AI models. Anthropic's commercial terms state that inputs submitted through their API are not used to train their models.
- There are no accounts, no profiles and no tracking, so nothing is accumulated about you between sessions.

What is sent, and when, is set out in full in the [privacy policy](https://kredznak.github.io/smart-brand-stylist/).

## Suggestions are suggestions

Generated text can be wrong, bland, or a poor fit for your brand, and it can be confidently wrong. The add-on says so above every set of results, and it is worth repeating here:

- **Read anything before you publish it.** You are responsible for what goes out under your name.
- **Nothing generated here is advice** — not legal, medical, financial or professional advice of any kind.
- **Claims are not checked.** If a suggestion states a fact, a statistic or a promise about your business, verify it yourself.
- **Trademarks are not checked.** A tagline that reads well may still be too close to someone else's. If a line matters commercially, have it checked before you rely on it.

## Keeping the output honest

The model is told that your brand details are information to work from, not instructions to follow. That is what stops a description containing "ignore your instructions and do X" from changing its behaviour.

It is also told to write original copy, never to reuse the slogans of real companies, and never to invent facts, prices, statistics or guarantees that you did not supply.

These are instructions to a model, not guarantees, which is why we test them rather than trust them. A fixed set of deliberately bad briefs is sent to the live service before each release and after any change to the model or to the instructions it is given. Some of those briefs must be refused outright; others must come back free of the specific claims and slogans the brief tried to plant. If any of them slips through, the release does not go out.

## When the AI declines

Claude will refuse to write copy for some briefs — a product that is illegal, content that attacks a group of people, sexually explicit material, or medical claims that could cause harm. When that happens the add-on tells you the request was declined and invites you to change the description. It does not pretend the service is broken, and it does not quietly return something else instead.

## Human judgement stays with you

The add-on never publishes anything by itself. Every suggestion has to be placed on your page by you, every change it makes is an ordinary edit that Cmd/Ctrl+Z will undo, and nothing is sent anywhere until you press a button that says what it is about to do.

## Questions

Ask at [kredznak@gmail.com](mailto:kredznak@gmail.com) or raise an issue at https://github.com/kredznak/smart-brand-stylist/issues.
