// import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository, FindManyOptions } from 'typeorm';
// import { CollectionEntity, CollectionVisibility } from '../entities/collection.entity';
// import { CreateCollectionDto } from '../dto/create-collection.dto';
// import { UpdateCollectionDto } from '../dto/update-collection.dto';
// import { ActorEntity } from '../../activitypub/entities/actor.entity';
// import { AbilityFactory, Action } from 'src/shared/authorization/ability.factory';

// @Injectable()
// export class CollectionService {
//   constructor(
//     @InjectRepository(CollectionEntity)
//     private readonly collectionRepository: Repository<CollectionEntity>,
//     private readonly abilityFactory: AbilityFactory,
//   ) {}

//   async create(createCollectionDto: CreateCollectionDto, owner: ActorEntity): Promise<CollectionEntity> {
//     const collection = this.collectionRepository.create({
//       ...createCollectionDto,
//       owner,
//     });
//     return this.collectionRepository.save(collection);
//   }

//   async findAll(user?: ActorEntity): Promise<CollectionEntity[]> {
//     const options: FindManyOptions<CollectionEntity> = {
//       where: { visibility: CollectionVisibility.PUBLIC },
//       relations: ['items', 'items.object'],
//     };

//     // If a user is present, we could potentially add their private collections
//     // For now, we only return public ones as per the simplest interpretation of AC#4
//     return this.collectionRepository.find(options);
//   }

//   async findOne(id: string, user?: ActorEntity): Promise<CollectionEntity> {
//     const collection = await this.collectionRepository.findOne({
//         where: { id },
//         relations: ['owner', 'items', 'items.object']
//     });

//     if (!collection) {
//       throw new NotFoundException(`Collection with ID "${id}" not found`);
//     }

//     if (collection.visibility === CollectionVisibility.PRIVATE) {
//       if (!user) {
//         throw new ForbiddenException('You do not have permission to view this collection');
//       }
//       const ability = this.abilityFactory.defineAbilitiesFor(user);
//       if (ability.cannot(Action.Read, collection)) {
//          throw new ForbiddenException('You do not have permission to view this collection');
//       }
//     }
    
//     return collection;
//   }

//   async update(id: string, updateCollectionDto: UpdateCollectionDto, user: ActorEntity): Promise<CollectionEntity> {
//     const collection = await this.findOne(id, user); // findOne includes permission checks for private collections
    
//     const ability = this.abilityFactory.defineAbilitiesFor(user);
//     if (ability.cannot(Action.Update, collection)) {
//         throw new ForbiddenException('You do not have permission to update this collection');
//     }

//     Object.assign(collection, updateCollectionDto);
//     return this.collectionRepository.save(collection);
//   }

//   async remove(id: string, user: ActorEntity): Promise<void> {
//     const collection = await this.findOne(id, user);

//     const ability = this.abilityFactory.defineAbilitiesFor(user);
//     if (ability.cannot(Action.Delete, collection)) {
//         throw new ForbiddenException('You do not have permission to delete this collection');
//     }

//     await this.collectionRepository.remove(collection);
//   }
// }
