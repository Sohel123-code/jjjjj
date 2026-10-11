import { vi } from 'vitest';
Object.defineProperty(window,'scrollTo',{value:vi.fn(),writable:true});
Element.prototype.scrollIntoView=vi.fn();
Object.defineProperty(navigator,'clipboard',{value:{writeText:vi.fn().mockResolvedValue()},configurable:true});
